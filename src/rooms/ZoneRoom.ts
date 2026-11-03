import { Room, type Client } from "colyseus";
import { Mob, Player, ZoneState } from "./schema/ZoneState.js";
import { ZONES, isWalkable, type ZoneDef, type ZoneId } from "../shared/zones.js";
import {
  ATTACK_COOLDOWN_MS, ATTACK_RANGE, DAY_LENGTH_S, HEAL_AMOUNT, HEAL_COOLDOWN_MS, HEAL_RANGE,
  MAX_CHAT_LENGTH, MAX_NAME_LENGTH, MOB_KINDS, PLAYER_RADIUS, RUN_SPEED, SERVER_TICK_MS,
  TUNIC_COLORS, mobRadius, mobXp, playerDamage, playerMaxHp, xpToNextLevel, type MobKind,
} from "../shared/rules.js";
import { characters, travelTickets, type CharacterRecord } from "../characters.js";

const BOOT_TIME = Date.now();

interface MobRuntime {
  id: string;
  kind: MobKind;
  homeX: number;
  homeZ: number;
  wander: number;
  goalX: number;
  goalZ: number;
  nextWanderAt: number;
  lastAttackAt: number;
  respawnAt: number;
  contributors: Set<string>;
}

interface PlayerRuntime {
  lastMoveAt: number;
  lastAttackAt: number;
  lastHealAt: number;
  lastHurtAt: number;
  respawnAt: number;
  chatTimes: number[];
}

interface JoinOptions {
  name?: string;
  color?: string;
  ticket?: string;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function cleanName(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const cleaned = s.replace(/[^\p{L}\p{N} _'-]/gu, "").trim().slice(0, MAX_NAME_LENGTH);
  return cleaned.length >= 2 ? cleaned : `Voyageur${randInt(100, 999)}`;
}

/**
 * Une instance de zone. Chaque zone (clairière, grotte…) est un type de room
 * Colyseus ; si une instance est pleine, une nouvelle est créée automatiquement.
 */
export class ZoneRoom extends Room<{ state: ZoneState }> {
  maxClients = 80;
  state = new ZoneState();

  private zone!: ZoneDef;
  private mobRt = new Map<string, MobRuntime>();
  private playerRt = new Map<string, PlayerRuntime>();

  messages = {
    move: (client: Client, msg: any) => this.onMove(client, msg),
    attack: (client: Client, msg: any) => this.onAttack(client, msg),
    heal: (client: Client, msg: any) => this.onHeal(client, msg),
    target: (client: Client, msg: any) => {
      const p = this.state.players.get(client.sessionId);
      if (p && typeof msg?.id === "string") p.targetId = msg.id.slice(0, 32);
    },
    chat: (client: Client, msg: any) => this.onChat(client, msg),
    portal: (client: Client, msg: any) => this.onPortal(client, msg),
  };

  onCreate(options: { zoneId: ZoneId }) {
    this.zone = ZONES[options.zoneId];
    this.state.zoneId = this.zone.id;
    this.setMetadata({ zone: this.zone.id });
    this.zone.mobs.forEach((spawn, i) => this.spawnMob(`m${i}`, spawn.kind, spawn.x, spawn.z, spawn.wander));
    this.updateTime();
    this.setSimulationInterval((dt) => this.tick(dt), SERVER_TICK_MS);
  }

  onJoin(client: Client, options: JoinOptions = {}) {
    let record: CharacterRecord | undefined;
    let x = this.zone.spawn.x;
    let z = this.zone.spawn.z;

    // Arrivée par un portail : on récupère le personnage confié par l'autre zone.
    const ticket = typeof options.ticket === "string" ? travelTickets.take(options.ticket) : undefined;
    if (ticket && ticket.to === this.zone.id) {
      record = ticket.character;
      x = ticket.x;
      z = ticket.z;
    } else {
      const name = cleanName(options.name);
      const color = TUNIC_COLORS.includes(options.color ?? "") ? options.color! : TUNIC_COLORS[0];
      record = characters.load(name) ?? { name, color, level: 1, xp: 0, hp: playerMaxHp(1) };
      record.color = color;
      x += rand(-2, 2);
      z += rand(-2, 2);
    }

    // Deux joueurs ne peuvent pas porter le même nom dans une même zone.
    for (const other of this.state.players.values()) {
      if (other.name === record.name) record = { ...record, name: `${record.name}${randInt(2, 99)}` };
    }

    const maxHp = playerMaxHp(record.level);
    this.state.players.set(client.sessionId, new Player({
      name: record.name, color: record.color, x, y: 0, z, ry: 0, anim: 0,
      level: record.level, xp: record.xp, hp: Math.min(maxHp, Math.max(1, record.hp)), maxHp,
      targetId: "", dead: false,
    }));
    const now = Date.now();
    this.playerRt.set(client.sessionId, {
      lastMoveAt: now, lastAttackAt: 0, lastHealAt: 0, lastHurtAt: 0, respawnAt: 0, chatTimes: [],
    });
    client.send("welcome", { zone: this.zone.id, sessionId: client.sessionId });
    this.broadcast("system", { text: `${record.name} arrive dans ${this.zone.name}.` }, { except: client });
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) {
      characters.save({ name: p.name, color: p.color, level: p.level, xp: p.xp, hp: p.hp });
      this.broadcast("system", { text: `${p.name} quitte la zone.` }, { except: client });
    }
    this.state.players.delete(client.sessionId);
    this.playerRt.delete(client.sessionId);
    for (const mob of this.state.mobs.values()) {
      if (mob.targetId === client.sessionId) mob.targetId = "";
    }
    for (const rt of this.mobRt.values()) rt.contributors.delete(client.sessionId);
  }

  // -------------------------------------------------------------------------
  // Messages des joueurs
  // -------------------------------------------------------------------------

  private onMove(client: Client, msg: any) {
    const p = this.state.players.get(client.sessionId);
    const rt = this.playerRt.get(client.sessionId);
    if (!p || !rt || p.dead) return;
    if (!isNum(msg?.x) || !isNum(msg?.z) || !isNum(msg?.y) || !isNum(msg?.ry)) return;

    const now = Date.now();
    const dt = Math.min(1, (now - rt.lastMoveAt) / 1000);
    const dist = Math.hypot(msg.x - p.x, msg.z - p.z);
    const allowed = RUN_SPEED * dt * 1.4 + 0.75;
    if (dist > allowed || !isWalkable(this.zone.id, msg.x, msg.z)) {
      client.send("correct", { x: p.x, z: p.z });
      rt.lastMoveAt = now;
      return;
    }
    p.x = msg.x;
    p.y = msg.y;
    p.z = msg.z;
    p.ry = msg.ry;
    p.anim = isNum(msg.anim) ? Math.max(0, Math.min(5, Math.floor(msg.anim))) : 0;
    rt.lastMoveAt = now;
  }

  private onAttack(client: Client, msg: any) {
    const p = this.state.players.get(client.sessionId);
    const rt = this.playerRt.get(client.sessionId);
    const mob = typeof msg?.id === "string" ? this.state.mobs.get(msg.id) : undefined;
    if (!p || !rt || p.dead || !mob) return;
    const mrt = this.mobRt.get(msg.id)!;
    if (mob.mode === 3) return;

    const now = Date.now();
    if (now - rt.lastAttackAt < ATTACK_COOLDOWN_MS - 80) return;
    const dist = Math.hypot(mob.x - p.x, mob.z - p.z);
    if (dist > ATTACK_RANGE + mobRadius(mrt.kind) + 0.4) {
      client.send("error", { text: "Trop loin." });
      return;
    }
    rt.lastAttackAt = now;

    const [min, max] = playerDamage(p.level);
    const crit = Math.random() < 0.15;
    const amount = Math.round(randInt(min, max) * (crit ? 1.8 : 1));
    mob.hp = Math.max(0, mob.hp - amount);
    mrt.contributors.add(client.sessionId);
    if (!mob.targetId) mob.targetId = client.sessionId;
    p.targetId = msg.id;
    this.broadcast("hit", { from: client.sessionId, to: msg.id, amount, crit, kind: "player" });

    if (mob.hp <= 0) this.killMob(mob, mrt);
  }

  private onHeal(client: Client, msg: any) {
    const p = this.state.players.get(client.sessionId);
    const rt = this.playerRt.get(client.sessionId);
    if (!p || !rt || p.dead) return;
    const targetId = typeof msg?.id === "string" && this.state.players.has(msg.id) ? msg.id : client.sessionId;
    const target = this.state.players.get(targetId)!;
    if (target.dead) return;
    const now = Date.now();
    if (now - rt.lastHealAt < HEAL_COOLDOWN_MS - 100) return;
    if (Math.hypot(target.x - p.x, target.z - p.z) > HEAL_RANGE) {
      client.send("error", { text: "Cible trop éloignée." });
      return;
    }
    rt.lastHealAt = now;
    const amount = Math.min(target.maxHp - target.hp, HEAL_AMOUNT + p.level * 4);
    target.hp += amount;
    this.broadcast("heal", { from: client.sessionId, to: targetId, amount });
  }

  private onChat(client: Client, msg: any) {
    const p = this.state.players.get(client.sessionId);
    const rt = this.playerRt.get(client.sessionId);
    if (!p || !rt || typeof msg?.text !== "string") return;
    const text = msg.text.replace(/[\u0000-\u001f]/g, "").trim().slice(0, MAX_CHAT_LENGTH);
    if (!text) return;
    const now = Date.now();
    rt.chatTimes = rt.chatTimes.filter((t) => now - t < 5000);
    if (rt.chatTimes.length >= 5) {
      client.send("error", { text: "Doucement ! Attends un peu avant de reparler." });
      return;
    }
    rt.chatTimes.push(now);
    this.broadcast("chat", { from: p.name, color: p.color, id: client.sessionId, text });
  }

  private onPortal(client: Client, msg: any) {
    const p = this.state.players.get(client.sessionId);
    const portal = this.zone.portals.find((po) => po.id === msg?.id);
    if (!p || !portal || p.dead) return;
    if (Math.hypot(portal.x - p.x, portal.z - p.z) > portal.radius + 2.5) return;
    const record: CharacterRecord = { name: p.name, color: p.color, level: p.level, xp: p.xp, hp: p.hp };
    characters.save(record);
    const ticket = travelTickets.issue({ to: portal.to, x: portal.arrival.x, z: portal.arrival.z, character: record });
    client.send("travel", { to: portal.to, ticket });
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  private updateTime() {
    this.state.timeOfDay = (0.36 + (Date.now() - BOOT_TIME) / 1000 / DAY_LENGTH_S) % 1;
  }

  private tick(dtMs: number) {
    const dt = dtMs / 1000;
    const now = Date.now();
    this.updateTime();

    for (const [id, mob] of this.state.mobs) this.tickMob(mob, this.mobRt.get(id)!, dt, now);

    for (const [id, p] of this.state.players) {
      const rt = this.playerRt.get(id)!;
      if (p.dead) {
        if (now >= rt.respawnAt) {
          p.dead = false;
          p.hp = p.maxHp;
          p.x = this.zone.spawn.x + rand(-2, 2);
          p.z = this.zone.spawn.z + rand(-2, 2);
          this.clients.getById(id)?.send("respawn", { x: p.x, z: p.z });
        }
        continue;
      }
      // Régénération hors combat
      if (now - rt.lastHurtAt > 6000 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + Math.max(1, Math.round(p.maxHp * 0.03 * dt * 2)) * (Math.random() < 0.5 ? 1 : 0));
      }
    }
  }

  private spawnMob(id: string, kindId: keyof typeof MOB_KINDS, x: number, z: number, wander: number) {
    const kind = MOB_KINDS[kindId];
    this.state.mobs.set(id, new Mob({
      kind: kind.id, x, z, ry: rand(0, Math.PI * 2), hp: kind.hp, maxHp: kind.hp, mode: 0, targetId: "",
    }));
    this.mobRt.set(id, {
      id, kind, homeX: x, homeZ: z, wander, goalX: x, goalZ: z,
      nextWanderAt: Date.now() + rand(1000, 6000), lastAttackAt: 0, respawnAt: 0, contributors: new Set(),
    });
  }

  private moveMobToward(mob: Mob, kind: MobKind, tx: number, tz: number, speed: number, dt: number, stopAt = 0): boolean {
    const dx = tx - mob.x;
    const dz = tz - mob.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopAt + 0.05) return true;
    const step = Math.min(d - stopAt, speed * dt);
    const nx = mob.x + (dx / d) * step;
    const nz = mob.z + (dz / d) * step;
    const r = mobRadius(kind);
    if (isWalkable(this.zone.id, nx, nz, r)) {
      mob.x = nx;
      mob.z = nz;
    } else if (isWalkable(this.zone.id, nx, mob.z, r)) {
      mob.x = nx;
    } else if (isWalkable(this.zone.id, mob.x, nz, r)) {
      mob.z = nz;
    }
    mob.ry = Math.atan2(dx, dz);
    return false;
  }

  private tickMob(mob: Mob, rt: MobRuntime, dt: number, now: number) {
    const kind = rt.kind;
    if (mob.mode === 3) {
      if (now >= rt.respawnAt) {
        mob.x = rt.homeX;
        mob.z = rt.homeZ;
        mob.hp = mob.maxHp;
        mob.mode = 0;
        mob.targetId = "";
        rt.contributors.clear();
      }
      return;
    }

    let target = mob.targetId ? this.state.players.get(mob.targetId) : undefined;
    if (target && target.dead) target = undefined;

    // Laisse : un monstre entraîné trop loin de chez lui abandonne et se soigne.
    if (target && Math.hypot(mob.x - rt.homeX, mob.z - rt.homeZ) > 32) target = undefined;

    if (!target && kind.aggroRadius > 0) {
      let best = kind.aggroRadius;
      for (const [id, p] of this.state.players) {
        if (p.dead) continue;
        const d = Math.hypot(p.x - mob.x, p.z - mob.z);
        if (d < best) {
          best = d;
          target = p;
          mob.targetId = id;
        }
      }
    }

    if (!target) {
      if (mob.targetId) {
        mob.targetId = "";
        mob.hp = mob.maxHp;
        rt.contributors.clear();
        rt.goalX = rt.homeX;
        rt.goalZ = rt.homeZ;
      }
      if (now >= rt.nextWanderAt) {
        const a = rand(0, Math.PI * 2);
        const r = rand(0, rt.wander);
        const gx = rt.homeX + Math.cos(a) * r;
        const gz = rt.homeZ + Math.sin(a) * r;
        if (isWalkable(this.zone.id, gx, gz, mobRadius(kind))) {
          rt.goalX = gx;
          rt.goalZ = gz;
        }
        rt.nextWanderAt = now + rand(3000, 8000);
      }
      const arrived = this.moveMobToward(mob, kind, rt.goalX, rt.goalZ, kind.speed * 0.55, dt);
      mob.mode = arrived ? 0 : 1;
      return;
    }

    mob.mode = 2;
    const reach = mobRadius(kind) + PLAYER_RADIUS + 0.9;
    const arrived = this.moveMobToward(mob, kind, target.x, target.z, kind.speed * 1.35, dt, reach);
    if (arrived) {
      mob.ry = Math.atan2(target.x - mob.x, target.z - mob.z);
      if (now - rt.lastAttackAt >= kind.attackMs) {
        rt.lastAttackAt = now;
        const amount = randInt(kind.damage[0], kind.damage[1]);
        target.hp = Math.max(0, target.hp - amount);
        const prt = this.playerRt.get(mob.targetId);
        if (prt) prt.lastHurtAt = now;
        this.broadcast("hit", { from: rt.id, to: mob.targetId, amount, crit: false, kind: "mob" });
        if (target.hp <= 0) this.killPlayer(mob.targetId, target, kind);
      }
    }
  }

  private killMob(mob: Mob, rt: MobRuntime) {
    mob.mode = 3;
    mob.targetId = "";
    rt.respawnAt = Date.now() + rt.kind.respawnMs;

    // L'expérience est partagée entre tous ceux qui ont participé, avec un bonus de groupe.
    const helpers = [...rt.contributors]
      .map((id) => [id, this.state.players.get(id)] as const)
      .filter(([, p]) => p && !p.dead && Math.hypot(p.x - mob.x, p.z - mob.z) < 45);
    const n = helpers.length;
    if (n > 0) {
      const share = Math.round((mobXp(rt.kind) * (1 + 0.15 * (n - 1))) / n);
      for (const [id, p] of helpers) this.giveXp(id, p!, share);
    }
    this.broadcast("mobDeath", { id: rt.id, name: rt.kind.name });
    rt.contributors.clear();
  }

  private giveXp(id: string, p: Player, amount: number) {
    p.xp += amount;
    this.clients.getById(id)?.send("xp", { amount });
    while (p.xp >= xpToNextLevel(p.level) && p.level < 50) {
      p.xp -= xpToNextLevel(p.level);
      p.level += 1;
      p.maxHp = playerMaxHp(p.level);
      p.hp = p.maxHp;
      this.broadcast("levelup", { id, name: p.name, level: p.level });
    }
  }

  private killPlayer(id: string, p: Player, by: MobKind) {
    p.dead = true;
    p.anim = 0;
    p.targetId = "";
    const rt = this.playerRt.get(id);
    if (rt) rt.respawnAt = Date.now() + 6000;
    for (const mob of this.state.mobs.values()) {
      if (mob.targetId === id) mob.targetId = "";
    }
    this.broadcast("system", { text: `${p.name} a été vaincu par ${by.name}.` });
  }
}
