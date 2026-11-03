/**
 * Cœur du client : scène 3D, connexion au serveur, entités, contrôles et boucle de jeu.
 */
import {
  ArcRotateCamera, Color3, DefaultRenderingPipeline, Engine, GlowLayer,
  ImageProcessingConfiguration, Mesh, MeshBuilder, PointLight, PointerEventTypes, Scene, StandardMaterial, Vector3,
} from "@babylonjs/core";
import { Callbacks, ColyseusSDK, type Room } from "@colyseus/sdk";
import { buildDungeon } from "./world/dungeon.js";
import { buildOutdoor } from "./world/outdoor.js";
import type { ZoneWorld } from "./world/world.js";
import { clockLabel } from "./world/atmosphere.js";
import { BIOMES, findBiome, setForcedBiome } from "./world/biomes.js";
import { Character } from "./entities/character.js";
import { MobView } from "./entities/mob.js";
import { Hud, Loading } from "./ui/hud.js";
import { Minimap, type MapDot } from "./ui/minimap.js";
import { Nameplates, type Plate } from "./ui/nameplates.js";
import { burst } from "./effects.js";
import { hex } from "./world/kit.js";
import { LOW_QUALITY } from "./quality.js";
import {
  ATTACK_COOLDOWN_MS, ATTACK_RANGE, CLIENT_SEND_MS, HEAL_COOLDOWN_MS, MOB_KINDS, PLAYER_RADIUS,
  RUN_SPEED, WALK_SPEED, mobRadius, xpToNextLevel, type MobKind, type MobKindId,
} from "../shared/rules.js";
import { WATER_LEVEL, ZONES, heightAt, isWalkable, zoneObstacles, type Obstacle, type ZoneId } from "../shared/zones.js";

interface RemotePlayer {
  char: Character;
  plate: Plate;
  x: number;
  y: number;
  z: number;
  speed: number;
}

interface MobEntity {
  view: MobView;
  plate: Plate;
  kind: MobKind;
  x: number;
  z: number;
  speed: number;
}

interface Target {
  type: "mob" | "player";
  id: string;
}

/** Couleur de « considération » d'un monstre selon l'écart de niveau (façon old-school). */
function conColor(mobLevel: number, myLevel: number): string {
  const d = mobLevel - myLevel;
  if (d <= -3) return "#a8a8a8";
  if (d === -2) return "#7be07b";
  if (d === -1) return "#7ccfff";
  if (d === 0) return "#ffffff";
  if (d <= 2) return "#ffd84a";
  return "#ff5a4a";
}

function conText(kind: MobKind, myLevel: number): string {
  const d = kind.level - myLevel;
  if (kind.boss) return `${kind.name} te toise. Seul, tu n'as aucune chance : rassemble un groupe.`;
  if (d <= -3) return `${kind.name} ne te prête aucune attention. Une proie facile.`;
  if (d <= -1) return `${kind.name} te jauge prudemment. Ça devrait aller.`;
  if (d === 0) return `${kind.name} semble de taille à t'affronter. Un combat équitable.`;
  if (d <= 2) return `${kind.name} te fixe d'un air menaçant. Sois prudent.`;
  return `${kind.name} te regarde comme un repas. Fuis !`;
}

export class Game {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private plates: Nameplates;
  private hud = new Hud();
  private loading = new Loading();
  private minimap: Minimap;
  private world: ZoneWorld | null = null;
  private zoneId: ZoneId = "clairiere";
  private obstacles: Obstacle[] = [];
  private portalNodes: Mesh[] = [];
  /** Lanterne du joueur : une lumière chaude qui le suit sous terre. */
  private lantern: PointLight | null = null;
  private pipeline: DefaultRenderingPipeline;

  private client: ColyseusSDK;
  private room: Room<any, any> | null = null;
  private sessionId = "";
  private traveling = false;
  private mode: "title" | "playing" | "loading" = "title";
  private previewTime = 0.71;
  private timeOverride: number | null = null;

  private me: Character | null = null;
  private mePlate: Plate | null = null;
  private pos = new Vector3();
  private vy = 0;
  private grounded = true;
  private anim = 0;
  private sitting = false;
  private emoteUntil = 0;
  private lastSent = { t: 0, x: 0, y: 0, z: 0, ry: 0, anim: -1 };
  private portalCooldown = 0;

  private remotes = new Map<string, RemotePlayer>();
  private mobs = new Map<string, MobEntity>();
  private target: Target | null = null;
  private targetRing: Mesh;
  private autoAttack = false;
  private lastAttack = 0;
  private lastHeal = 0;
  private lastRangeMsg = 0;
  private wasDead = false;

  private keys = new Set<string>();
  /** Pilote automatique utilisé par les tests (va tout droit vers un point). */
  private autopilot: { x: number; z: number } | null = null;
  private jumpQueued = false;
  private unsub: Array<() => void> = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: true, antialias: true, powerPreference: "high-performance" }, true);
    this.engine.setHardwareScalingLevel(LOW_QUALITY ? 1 : 1 / Math.min(window.devicePixelRatio || 1, 1.5));
    this.scene = new Scene(this.engine);
    this.scene.collisionsEnabled = true;

    const cam = new ArcRotateCamera("cam", -Math.PI / 2, 1.2, 34, new Vector3(0, 2, 0), this.scene);
    cam.minZ = 0.1;
    cam.maxZ = 1200;
    cam.lowerRadiusLimit = 3;
    cam.upperRadiusLimit = 26;
    cam.lowerBetaLimit = 0.3;
    cam.upperBetaLimit = 1.55;
    cam.wheelDeltaPercentage = 0.012;
    cam.panningSensibility = 0;
    cam.angularSensibilityX = 700;
    cam.angularSensibilityY = 700;
    cam.inertia = 0.75;
    cam.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    // Les collisions de la caméra sont gérées à la main (voir cameraBoom).
    this.camera = cam;

    const pipeline = new DefaultRenderingPipeline("pp", true, this.scene, [cam]);
    this.pipeline = pipeline;
    pipeline.samples = LOW_QUALITY ? 1 : 4;
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = !LOW_QUALITY;
    pipeline.bloomThreshold = 0.72;
    pipeline.bloomWeight = 0.32;
    pipeline.bloomKernel = 64;
    pipeline.bloomScale = 0.5;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipeline.imageProcessing.exposure = 1.15;
    pipeline.imageProcessing.contrast = 1.18;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 2.2;
    pipeline.imageProcessing.vignetteColor.set(0.05, 0.03, 0.08, 1);

    if (!LOW_QUALITY) {
      const glow = new GlowLayer("glow", this.scene, { mainTextureSamples: 2, blurKernelSize: 48 });
      glow.intensity = 0.65;
    }

    this.plates = new Nameplates(this.scene);
    this.minimap = new Minimap(document.getElementById("minimap") as HTMLCanvasElement);

    this.targetRing = MeshBuilder.CreateTorus("targetRing", { diameter: 1.6, thickness: 0.07, tessellation: 48 }, this.scene);
    const ringMat = new StandardMaterial("ringMat", this.scene);
    ringMat.diffuseColor = Color3.Black();
    ringMat.emissiveColor = hex("#ffd84a");
    ringMat.disableLighting = true;
    this.targetRing.material = ringMat;
    this.targetRing.isPickable = false;
    this.targetRing.setEnabled(false);

    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.client = new ColyseusSDK(`${proto}://${location.host}`);

    this.loadWorld("clairiere");
    this.bindInput();
    window.addEventListener("resize", () => this.engine.resize());
    this.engine.runRenderLoop(() => this.frame());
  }

  // ---------------------------------------------------------------------
  // Zones
  // ---------------------------------------------------------------------

  private loadWorld(zone: ZoneId) {
    this.world?.dispose();
    this.zoneId = zone;
    this.world = ZONES[zone].kind === "outdoor" ? buildOutdoor(this.scene) : buildDungeon(this.scene);
    this.obstacles = zoneObstacles(zone).filter((o) => o.r > 0.3);
    this.lantern?.dispose();
    this.lantern = null;
    if (ZONES[zone].kind === "dungeon") {
      this.lantern = new PointLight("lantern", new Vector3(0, 3, 0), this.scene);
      this.lantern.diffuse = hex("#ffd2a0");
      this.lantern.specular = Color3.Black();
      this.lantern.range = 16;
      this.lantern.intensity = 1.0;
    }
    this.applyGrade();
    this.minimap.setZone(zone);
    this.hud.setZoneLabel(ZONES[zone].name);
    this.portalNodes.forEach((n) => n.dispose());
    this.portalNodes = this.world.portalAnchors.map((a) => {
      const node = nodeAt(this.scene, a.position);
      const p = this.plates.create(node, `✦ ${a.label} ✦`, "#c9b0ff", false);
      p.name.fontSize = 16;
      return node;
    });
  }

  private groundY(x: number, z: number): number {
    if (ZONES[this.zoneId].kind === "dungeon") return 0;
    const floor = this.world?.waterFloor;
    const area = this.world?.waterArea;
    // Lac gelé (ou croûte de cendre) : on marche à la surface.
    if (floor !== undefined && area && Math.hypot(x - area.x, z - area.z) < area.radius) {
      return Math.max(heightAt(this.zoneId, x, z), floor);
    }
    return Math.max(heightAt(this.zoneId, x, z), WATER_LEVEL - 0.55);
  }

  /** Étalonnage de l'image propre à l'ambiance de la zone. */
  private applyGrade() {
    const ip = this.pipeline.imageProcessing;
    const g = this.world?.grade;
    ip.exposure = g?.exposure ?? 1.15;
    ip.contrast = g?.contrast ?? 1.18;
    ip.colorCurvesEnabled = !!g;
    if (g) {
      ip.colorCurves!.globalSaturation = g.saturation;
      ip.colorCurves!.globalHue = g.hue;
      ip.colorCurves!.globalDensity = g.hueAmount;
    }
  }

  /** Change l'ambiance de la zone extérieure (essai local, visible par toi seul). */
  setAmbiance(id: string | null) {
    setForcedBiome(id);
    if (ZONES[this.zoneId].kind !== "outdoor") return;
    this.loadWorld(this.zoneId);
    const shadows = this.world!.shadows;
    this.me?.addToShadows(shadows);
    for (const r of this.remotes.values()) r.char.addToShadows(shadows);
    for (const m of this.mobs.values()) m.view.addToShadows(shadows);
    if (this.me) this.pos.y = this.groundY(this.pos.x, this.pos.z);
  }

  /** Lance la partie depuis l'écran titre. */
  async start(name: string, color: string) {
    this.mode = "loading";
    this.loading.show(ZONES.clairiere.name, ZONES.clairiere.subtitle);
    try {
      const room = await this.client.joinOrCreate<any>("clairiere", { name, color });
      this.attachRoom(room);
      this.enterPlay();
    } catch (err) {
      this.loading.hide();
      this.mode = "title";
      throw err;
    }
  }

  private enterPlay() {
    this.loading.hide();
    this.hud.show();
    this.mode = "playing";
    this.camera.attachControl(this.canvas, true);
    this.camera.radius = 11;
    this.camera.beta = 1.18;
    const def = ZONES[this.zoneId];
    this.hud.banner(def.name, def.subtitle);
    this.canvas.focus();
  }

  private async travel(to: ZoneId, ticket: string) {
    if (this.traveling) return;
    this.traveling = true;
    this.mode = "loading";
    this.autoAttack = false;
    this.loading.show(ZONES[to].name, ZONES[to].subtitle);
    burst(this.scene, this.pos.add(new Vector3(0, 1, 0)), "portal");
    const old = this.room;
    this.room = null;
    this.unsub.forEach((u) => u());
    this.unsub = [];
    await old?.leave(true).catch(() => undefined);
    this.clearEntities();
    await new Promise((r) => setTimeout(r, 60));
    this.loadWorld(to);
    try {
      const room = await this.client.joinOrCreate<any>(to, { ticket });
      this.attachRoom(room);
      this.enterPlay();
    } catch (e) {
      this.loading.show("Le passage s'est refermé…", "Recharge la page pour revenir au village.");
      console.error(e);
    } finally {
      this.traveling = false;
    }
  }

  private clearEntities() {
    this.me?.dispose();
    this.me = null;
    this.mePlate = null;
    for (const r of this.remotes.values()) r.char.dispose();
    for (const m of this.mobs.values()) m.view.dispose();
    this.remotes.clear();
    this.mobs.clear();
    this.plates.clear();
    this.setTarget(null);
  }

  // ---------------------------------------------------------------------
  // Réseau
  // ---------------------------------------------------------------------

  private attachRoom(room: Room<any, any>) {
    this.room = room;
    this.sessionId = room.sessionId;
    const cb: any = Callbacks.get(room);

    this.unsub.push(cb.onAdd("players", (p: any, id: string) => {
      if (id === this.sessionId) {
        this.me = new Character(this.scene, p.name, p.color, { pickId: id });
        this.me.addToShadows(this.world?.shadows ?? null);
        this.pos.set(p.x, this.groundY(p.x, p.z), p.z);
        this.me.setPosition(this.pos.x, this.pos.y, this.pos.z);
        this.me.face(Math.atan2(-this.pos.x, -this.pos.z), 0, true);
        this.mePlate = this.plates.create(this.me.headAnchor, p.name, "#ffe08a", false);
        this.camera.alpha = -this.me.facing - Math.PI / 2;
        this.camera.target.copyFrom(this.pos.add(new Vector3(0, 1.6, 0)));
        return;
      }
      const char = new Character(this.scene, p.name, p.color, { pickId: id });
      char.addToShadows(this.world?.shadows ?? null);
      char.setPosition(p.x, p.y, p.z);
      const plate = this.plates.create(char.headAnchor, p.name, "#8fd0ff", false);
      this.remotes.set(id, { char, plate, x: p.x, y: p.y, z: p.z, speed: 0 });
    }));
    this.unsub.push(cb.onRemove("players", (_p: any, id: string) => {
      const r = this.remotes.get(id);
      if (!r) return;
      r.char.dispose();
      this.plates.remove(r.plate);
      this.remotes.delete(id);
      if (this.target?.id === id) this.setTarget(null);
    }));
    this.unsub.push(cb.onAdd("mobs", (m: any, id: string) => {
      const kind = MOB_KINDS[m.kind as MobKindId];
      const view = new MobView(this.scene, id, kind);
      view.addToShadows(this.world?.shadows ?? null);
      view.root.position.set(m.x, this.groundY(m.x, m.z), m.z);
      const plate = this.plates.create(view.headAnchor, kind.name, "#ffffff", true);
      this.mobs.set(id, { view, plate, kind, x: m.x, z: m.z, speed: 0 });
    }));
    this.unsub.push(cb.onRemove("mobs", (_m: any, id: string) => {
      const e = this.mobs.get(id);
      if (!e) return;
      e.view.dispose();
      this.plates.remove(e.plate);
      this.mobs.delete(id);
    }));

    room.onMessage("welcome", () => undefined);
    room.onMessage("chat", (m: any) => {
      this.hud.chat("chat", m.text, { name: m.from, color: m.color });
      const plate = m.id === this.sessionId ? this.mePlate : this.remotes.get(m.id)?.plate;
      if (plate) this.plates.say(plate, m.text);
    });
    room.onMessage("system", (m: any) => this.hud.chat("sys", m.text));
    room.onMessage("error", (m: any) => this.hud.chat("err", m.text));
    room.onMessage("correct", (m: any) => {
      this.pos.x = m.x;
      this.pos.z = m.z;
    });
    room.onMessage("respawn", (m: any) => {
      this.pos.set(m.x, this.groundY(m.x, m.z), m.z);
      this.hud.chat("sys", "Tu reprends connaissance près du point d'arrivée.");
    });
    room.onMessage("travel", (m: any) => void this.travel(m.to, m.ticket));
    room.onMessage("xp", (m: any) => {
      this.hud.chat("xp", `Tu gagnes ${m.amount} points d'expérience.`);
      if (this.me) this.plates.float(this.me.headAnchor.getAbsolutePosition(), `+${m.amount} XP`, "#c6a8ff", 18);
    });
    room.onMessage("levelup", (m: any) => {
      const char = m.id === this.sessionId ? this.me : this.remotes.get(m.id)?.char;
      if (char) burst(this.scene, char.root.position.add(new Vector3(0, 1, 0)), "level");
      if (m.id === this.sessionId) {
        this.hud.center(`Niveau ${m.level} !`, 3000);
        this.hud.chat("sys", `Tu atteins le niveau ${m.level} ! Tu te sens plus fort.`);
      } else {
        this.hud.chat("sys", `${m.name} atteint le niveau ${m.level} !`);
      }
    });
    room.onMessage("mobDeath", (m: any) => {
      this.hud.chat("combat", `${m.name} est vaincue.`);
      if (this.target?.id === m.id) {
        this.autoAttack = false;
        this.setTarget(null);
      }
    });
    room.onMessage("hit", (m: any) => this.onHit(m));
    room.onMessage("heal", (m: any) => {
      const from = m.from === this.sessionId ? this.me : this.remotes.get(m.from)?.char;
      const to = m.to === this.sessionId ? this.me : this.remotes.get(m.to)?.char;
      from?.cast();
      if (to) {
        burst(this.scene, to.root.position.clone(), "heal");
        this.plates.float(to.headAnchor.getAbsolutePosition(), `+${m.amount}`, "#7cf07c", 22);
      }
      if (m.to === this.sessionId && m.from !== this.sessionId) {
        const who = this.room?.state.players.get(m.from)?.name ?? "Quelqu'un";
        this.hud.chat("heal", `${who} te soigne de ${m.amount} points de vie.`);
      }
    });
    room.onLeave((code: number) => {
      if (this.traveling || this.room !== room) return;
      this.hud.chat("err", `Connexion au serveur perdue (code ${code}). Recharge la page.`);
      this.loading.show("Connexion perdue", "Le serveur ne répond plus. Recharge la page (Cmd + R).");
    });
  }

  private onHit(m: { from: string; to: string; amount: number; crit: boolean; kind: "player" | "mob" }) {
    if (m.kind === "player") {
      const attacker = m.from === this.sessionId ? this.me : this.remotes.get(m.from)?.char;
      if (attacker && m.from !== this.sessionId) attacker.attack();
      const mob = this.mobs.get(m.to);
      if (!mob) return;
      mob.view.hurt();
      const at = mob.view.headAnchor.getAbsolutePosition();
      burst(this.scene, mob.view.root.position.add(new Vector3(0, 0.6 * mob.kind.scale, 0)), "hit");
      const mine = m.from === this.sessionId;
      const color = m.crit ? "#ff9a3a" : mine ? "#ffe08a" : "#f0f0f0";
      this.plates.float(at, m.crit ? `${m.amount} !` : `${m.amount}`, color, m.crit ? 30 : mine ? 24 : 18);
      if (mine) this.hud.chat("combat", `Tu frappes ${mob.kind.name} : ${m.amount} points de dégâts${m.crit ? " (critique !)" : ""}.`);
    } else {
      const mob = this.mobs.get(m.from);
      mob?.view.attack();
      const victim = m.to === this.sessionId ? this.me : this.remotes.get(m.to)?.char;
      victim?.hurt();
      if (victim) this.plates.float(victim.headAnchor.getAbsolutePosition(), `-${m.amount}`, "#ff5a4a", m.to === this.sessionId ? 24 : 16);
      if (m.to === this.sessionId) {
        this.hud.hurtFlash();
        this.hud.chat("combat", `${mob?.kind.name ?? "Un monstre"} te frappe : ${m.amount} points de dégâts.`);
        // Sur une attaque, si on n'a pas de cible, on prend l'agresseur.
        if (!this.target && mob) this.setTarget({ type: "mob", id: m.from });
      }
    }
  }

  // ---------------------------------------------------------------------
  // Contrôles
  // ---------------------------------------------------------------------

  private bindInput() {
    const chat = this.hud.chatInput;
    window.addEventListener("keydown", (e) => {
      if (this.mode !== "playing") return;
      if (document.activeElement === chat) {
        if (e.key === "Enter") {
          this.submitChat(chat.value);
          chat.value = "";
          chat.blur();
          this.canvas.focus();
        } else if (e.key === "Escape") {
          chat.blur();
          this.canvas.focus();
        }
        return;
      }
      if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      switch (e.code) {
        case "Enter":
        case "NumpadEnter":
          e.preventDefault();
          this.keys.clear();
          chat.focus();
          return;
        case "Space":
          if (!e.repeat) this.jumpQueued = true;
          break;
        case "Tab":
          this.cycleTarget();
          break;
        case "Digit1":
        case "Numpad1":
          if (!e.repeat) this.toggleAttack();
          break;
        case "Digit2":
        case "Numpad2":
          if (!e.repeat) this.castHeal();
          break;
        case "KeyH":
          if (!e.repeat) this.hud.toggleHelp();
          break;
        case "Escape":
          this.autoAttack = false;
          this.setTarget(null);
          break;
      }
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    document.getElementById("slot-1")!.addEventListener("click", () => this.toggleAttack());
    document.getElementById("slot-2")!.addEventListener("click", () => this.castHeal());

    let downX = 0, downY = 0, lastClick = 0, lastClickId = "";
    this.scene.onPointerObservable.add((pi) => {
      if (this.mode !== "playing") return;
      const ev = pi.event as PointerEvent;
      if (pi.type === PointerEventTypes.POINTERDOWN) {
        downX = ev.clientX;
        downY = ev.clientY;
      } else if (pi.type === PointerEventTypes.POINTERUP && ev.button === 0) {
        if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return;
        const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => !!m.metadata?.pickId && m.isEnabled());
        const id: string | undefined = pick?.pickedMesh?.metadata?.pickId;
        if (!id) return;
        const now = performance.now();
        if (this.mobs.has(id)) {
          this.setTarget({ type: "mob", id });
          if (now - lastClick < 350 && lastClickId === id) this.autoAttack = true;
        } else {
          this.setTarget({ type: "player", id });
        }
        lastClick = now;
        lastClickId = id;
      }
    });
  }

  private submitChat(raw: string) {
    const text = raw.trim();
    if (!text || !this.room) return;
    if (text.startsWith("/")) {
      const [cmd] = text.slice(1).toLowerCase().split(/\s+/);
      switch (cmd) {
        case "aide":
        case "help":
          this.hud.chat("sys", "Commandes : /salut, /assis, /qui, /loc, /ambiance, /aide. Touche H pour les contrôles.");
          return;
        case "ambiance": {
          const arg = text.slice(1).split(/\s+/).slice(1).join(" ");
          const list = Object.values(BIOMES).map((b) => b.id).join(", ");
          if (!arg) {
            const cur = this.world?.biome;
            this.hud.chat("sys", `Ambiance actuelle : ${cur?.name ?? "aucune (intérieur)"}. Essaie /ambiance <nom> parmi : ${list}, ou /ambiance zone.`);
            return;
          }
          if (ZONES[this.zoneId].kind !== "outdoor") {
            this.hud.chat("err", "Les ambiances ne s'appliquent qu'aux zones extérieures.");
            return;
          }
          if (["zone", "defaut", "défaut"].includes(arg.toLowerCase())) {
            this.setAmbiance(null);
            this.hud.chat("sys", `Retour à l'ambiance prévue pour la zone : ${this.world?.biome?.name}.`);
            return;
          }
          const b = findBiome(arg);
          if (!b) {
            this.hud.chat("err", `Ambiance inconnue : ${arg}. Choix : ${list}.`);
            return;
          }
          this.setAmbiance(b.id);
          this.hud.banner(b.name, b.mood);
          this.hud.chat("sys", `Ambiance « ${b.name} » (visible par toi seul). ${b.mood}`);
          return;
        }
        case "salut":
          this.emoteUntil = performance.now() + 2600;
          this.sitting = false;
          this.room.send("chat", { text: "* salue chaleureusement *" });
          return;
        case "assis":
          this.sitting = !this.sitting;
          return;
        case "qui": {
          const names: string[] = [];
          this.room.state.players.forEach((p: any) => names.push(`${p.name} (niv. ${p.level})`));
          this.hud.chat("sys", `Dans ${ZONES[this.zoneId].name} : ${names.join(", ")}`);
          return;
        }
        case "loc":
          this.hud.chat("sys", `Ta position : ${this.pos.x.toFixed(1)}, ${this.pos.z.toFixed(1)}`);
          return;
        default:
          this.hud.chat("err", `Commande inconnue : /${cmd}. Tape /aide.`);
          return;
      }
    }
    this.room.send("chat", { text });
  }

  private setTarget(t: Target | null) {
    this.target = t;
    if (!t) {
      this.autoAttack = false;
      this.targetRing.setEnabled(false);
      this.hud.setTarget(null);
      this.room?.send("target", { id: "" });
      return;
    }
    this.room?.send("target", { id: t.id });
    if (t.type === "mob") {
      const e = this.mobs.get(t.id);
      if (e) this.hud.chat("con", conText(e.kind, this.myLevel()));
    }
  }

  private cycleTarget() {
    const alive = [...this.mobs.entries()]
      .filter(([id]) => this.room?.state.mobs.get(id)?.mode !== 3)
      .map(([id, e]) => ({ id, d: Math.hypot(e.x - this.pos.x, e.z - this.pos.z) }))
      .filter((m) => m.d < 35)
      .sort((a, b) => a.d - b.d);
    if (!alive.length) return;
    const idx = this.target ? alive.findIndex((m) => m.id === this.target!.id) : -1;
    this.setTarget({ type: "mob", id: alive[(idx + 1) % alive.length].id });
  }

  private toggleAttack() {
    if (!this.target || this.target.type !== "mob") {
      this.cycleTarget();
      if (!this.target) {
        this.hud.chat("err", "Aucune cible. Clique sur un monstre ou appuie sur Tab.");
        return;
      }
    }
    this.autoAttack = !this.autoAttack;
    this.hud.chat("sys", this.autoAttack ? "Attaque automatique activée." : "Attaque automatique désactivée.");
  }

  private castHeal() {
    if (!this.room || this.isDead()) return;
    const now = performance.now();
    if (now - this.lastHeal < HEAL_COOLDOWN_MS) {
      this.hud.chat("err", "Ce sort n'est pas encore prêt.");
      return;
    }
    this.lastHeal = now;
    const id = this.target?.type === "player" ? this.target.id : this.sessionId;
    this.room.send("heal", { id });
    this.me?.cast();
  }

  private myLevel(): number {
    return this.room?.state?.players?.get(this.sessionId)?.level ?? 1;
  }

  private isDead(): boolean {
    return !!this.room?.state?.players?.get(this.sessionId)?.dead;
  }

  // ---------------------------------------------------------------------
  // Boucle de jeu
  // ---------------------------------------------------------------------

  private frame() {
    const dt = Math.min(0.1, this.engine.getDeltaTime() / 1000);
    const tod = this.timeOverride ?? (this.room?.state?.players ? this.room.state.timeOfDay : (this.previewTime += dt * 0.0015));
    this.world?.update(dt, tod);

    if (this.mode === "title") {
      this.camera.alpha += dt * 0.04;
      this.camera.target.set(0, 3, 0);
    } else if (this.mode === "playing" && this.me && this.room) {
      this.updateLocal(dt);
      this.updateCombat();
      this.sendMove();
    }
    this.updateRemotes(dt);
    this.updateMobs(dt);
    this.updateTargetRing(dt);
    this.plates.update(dt, this.camera.globalPosition);
    if (this.mode === "playing") this.updateHud(tod);
    const userRadius = this.camera.radius;
    if (this.mode === "playing") this.camera.radius = this.cameraBoom(userRadius);
    this.scene.render();
    this.camera.radius = userRadius;
  }

  /**
   * Raccourcit la distance de la caméra si le relief ou un mur se trouve entre
   * elle et le personnage, pour ne jamais voir « à travers » le décor.
   */
  private boom = 0;
  private cameraBoom(radius: number): number {
    const c = this.camera;
    const t = c.target;
    const dir = new Vector3(Math.cos(c.alpha) * Math.sin(c.beta), Math.cos(c.beta), Math.sin(c.alpha) * Math.sin(c.beta));
    const dungeon = ZONES[this.zoneId].kind === "dungeon";
    let limit = radius;
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const d = (radius * i) / steps;
      const x = t.x + dir.x * d;
      const y = t.y + dir.y * d;
      const z = t.z + dir.z * d;
      const blocked = dungeon ? !isWalkable(this.zoneId, x, z, 0.3) && y < 6 : y < heightAt(this.zoneId, x, z) + 0.45;
      if (blocked) {
        limit = Math.max(1.2, d - radius / steps);
        break;
      }
    }
    // Rapproche vite, recule en douceur.
    this.boom = limit < this.boom || this.boom === 0 ? limit : this.boom + (limit - this.boom) * 0.08;
    return Math.min(radius, this.boom);
  }

  private blocked(x: number, z: number): boolean {
    const dungeon = ZONES[this.zoneId].kind === "dungeon";
    if (!isWalkable(this.zoneId, x, z, dungeon ? PLAYER_RADIUS : 0)) return true;
    for (const o of this.obstacles) {
      const dx = o.x - x;
      const dz = o.z - z;
      const rr = o.r + PLAYER_RADIUS;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  private updateLocal(dt: number) {
    const me = this.me!;
    const state = this.room!.state.players.get(this.sessionId);
    const dead = !!state?.dead;
    if (dead !== this.wasDead) {
      this.hud.setDead(dead);
      if (dead) {
        this.autoAttack = false;
        this.setTarget(null);
      }
      this.wasDead = dead;
    }

    const k = this.keys;
    let fwd = 0, strafe = 0;
    if (!dead) {
      if (k.has("KeyW") || k.has("ArrowUp")) fwd += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) fwd -= 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) strafe -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) strafe += 1;
    }
    // Direction « devant » = de la caméra vers le personnage, à plat.
    const fx = -Math.cos(this.camera.alpha);
    const fz = -Math.sin(this.camera.alpha);
    const rx = fz;
    const rz = -fx;
    let dx = fx * fwd + rx * strafe;
    let dz = fz * fwd + rz * strafe;
    if (this.autopilot && !dead) {
      dx = this.autopilot.x - this.pos.x;
      dz = this.autopilot.z - this.pos.z;
      if (Math.hypot(dx, dz) < 0.6) {
        this.autopilot = null;
        dx = dz = 0;
      }
    }
    const len = Math.hypot(dx, dz);
    let speed = 0;
    if (len > 0) {
      dx /= len;
      dz /= len;
      speed = k.has("ShiftLeft") || k.has("ShiftRight") ? WALK_SPEED : RUN_SPEED;
      if (fwd < 0 && strafe === 0) speed *= 0.6;
      this.sitting = false;
      const nx = this.pos.x + dx * speed * dt;
      const nz = this.pos.z + dz * speed * dt;
      const ox = this.pos.x;
      const oz = this.pos.z;
      if (!this.blocked(nx, nz)) {
        this.pos.x = nx;
        this.pos.z = nz;
      } else if (!this.blocked(nx, this.pos.z)) {
        this.pos.x = nx;
      } else if (!this.blocked(this.pos.x, nz)) {
        this.pos.z = nz;
      }
      speed = Math.hypot(this.pos.x - ox, this.pos.z - oz) / dt;
      const faceYaw = fwd < 0 && strafe === 0 ? Math.atan2(fx, fz) : Math.atan2(dx, dz);
      me.face(faceYaw, dt);
    }

    if (this.jumpQueued && this.grounded && !dead) {
      this.vy = 7.2;
      this.grounded = false;
      this.sitting = false;
    }
    this.jumpQueued = false;
    this.vy -= 22 * dt;
    this.pos.y += this.vy * dt;
    const g = this.groundY(this.pos.x, this.pos.z);
    if (this.pos.y <= g) {
      this.pos.y = g;
      this.vy = 0;
      this.grounded = true;
    } else if (this.grounded && this.pos.y - g < 0.45) {
      this.pos.y = g; // suit le relief en descente
      this.vy = 0;
    } else {
      this.grounded = false;
    }

    const now = performance.now();
    this.anim = !this.grounded ? 3 : speed > 0.3 ? (speed > WALK_SPEED + 0.5 ? 2 : 1) : now < this.emoteUntil ? 4 : this.sitting ? 5 : 0;
    me.setPosition(this.pos.x, this.pos.y, this.pos.z);
    this.lantern?.position.set(this.pos.x, this.pos.y + 2.6, this.pos.z);
    me.update(dt, { speed, airborne: !this.grounded, anim: this.anim, dead });

    // Caméra : suit le personnage en douceur.
    const tgt = this.pos.add(new Vector3(0, 1.6, 0));
    Vector3.LerpToRef(this.camera.target, tgt, Math.min(1, dt * 14), this.camera.target);

    // Portails
    this.portalCooldown -= dt;
    if (this.portalCooldown <= 0 && !dead) {
      for (const p of ZONES[this.zoneId].portals) {
        if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < p.radius) {
          this.room!.send("portal", { id: p.id });
          this.portalCooldown = 2;
          this.hud.chat("sys", `Tu franchis le passage vers ${p.label}…`);
        }
      }
    }
  }

  private updateCombat() {
    if (!this.autoAttack || !this.target || this.target.type !== "mob" || this.isDead()) return;
    const e = this.mobs.get(this.target.id);
    const m = this.room!.state.mobs.get(this.target.id);
    if (!e || !m || m.mode === 3) {
      this.autoAttack = false;
      return;
    }
    const now = performance.now();
    const dist = Math.hypot(e.x - this.pos.x, e.z - this.pos.z);
    if (dist > ATTACK_RANGE + mobRadius(e.kind)) {
      if (now - this.lastRangeMsg > 3000) {
        this.hud.chat("err", "Ta cible est trop loin, rapproche-toi !");
        this.lastRangeMsg = now;
      }
      return;
    }
    this.me!.face(Math.atan2(e.x - this.pos.x, e.z - this.pos.z), 0.1);
    if (now - this.lastAttack >= ATTACK_COOLDOWN_MS) {
      this.lastAttack = now;
      this.room!.send("attack", { id: this.target.id });
      this.me!.attack();
    }
  }

  private sendMove() {
    const now = performance.now();
    const s = this.lastSent;
    if (now - s.t < CLIENT_SEND_MS) return;
    const yaw = this.me!.facing;
    const moved = Math.abs(this.pos.x - s.x) + Math.abs(this.pos.z - s.z) + Math.abs(this.pos.y - s.y) > 0.01;
    if (!moved && this.anim === s.anim && Math.abs(yaw - s.ry) < 0.01 && now - s.t < 1000) return;
    this.room!.send("move", { x: this.pos.x, y: this.pos.y, z: this.pos.z, ry: yaw, anim: this.anim });
    Object.assign(s, { t: now, x: this.pos.x, y: this.pos.y, z: this.pos.z, ry: yaw, anim: this.anim });
  }

  private updateRemotes(dt: number) {
    if (!this.room?.state?.players) return;
    const k = Math.min(1, dt * 12);
    for (const [id, r] of this.remotes) {
      const p = this.room.state.players.get(id);
      if (!p) continue;
      const ox = r.x, oz = r.z;
      r.x += (p.x - r.x) * k;
      r.z += (p.z - r.z) * k;
      r.y += (p.y - r.y) * k;
      const sp = Math.hypot(r.x - ox, r.z - oz) / Math.max(dt, 1e-3);
      r.speed += (sp - r.speed) * Math.min(1, dt * 10);
      r.char.setPosition(r.x, r.y, r.z);
      r.char.face(p.ry, dt);
      r.char.update(dt, { speed: r.speed, airborne: p.anim === 3, anim: p.anim, dead: p.dead });
    }
  }

  private updateMobs(dt: number) {
    if (!this.room?.state?.mobs) return;
    const k = Math.min(1, dt * 9);
    const lvl = this.myLevel();
    for (const [id, e] of this.mobs) {
      const m = this.room.state.mobs.get(id);
      if (!m) continue;
      const ox = e.x, oz = e.z;
      e.x += (m.x - e.x) * k;
      e.z += (m.z - e.z) * k;
      const sp = Math.hypot(e.x - ox, e.z - oz) / Math.max(dt, 1e-3);
      e.speed += (sp - e.speed) * Math.min(1, dt * 8);
      e.view.root.position.set(e.x, this.groundY(e.x, e.z), e.z);
      e.view.face(m.ry, dt);
      const dead = m.mode === 3;
      e.view.update(dt, e.speed, dead);
      e.plate.root.isVisible = !dead;
      e.plate.name.color = conColor(e.kind.level, lvl);
      this.plates.setHp(e.plate, m.hp / m.maxHp, m.hp < m.maxHp);
    }
  }

  private updateTargetRing(dt: number) {
    if (!this.target || !this.room?.state?.mobs) {
      this.targetRing.setEnabled(false);
      return;
    }
    let x = 0, y = 0, z = 0, scale = 1;
    let color = "#7cf07c";
    if (this.target.type === "mob") {
      const e = this.mobs.get(this.target.id);
      if (!e) return this.setTarget(null);
      x = e.x; z = e.z; y = this.groundY(x, z);
      scale = e.kind.scale * 1.1;
      color = conColor(e.kind.level, this.myLevel());
    } else {
      const char = this.target.id === this.sessionId ? this.me : this.remotes.get(this.target.id)?.char;
      if (!char) return this.setTarget(null);
      ({ x, y, z } = char.root.position);
    }
    this.targetRing.setEnabled(true);
    this.targetRing.position.set(x, y + 0.06, z);
    this.targetRing.scaling.set(scale, 0.25, scale);
    this.targetRing.rotation.y += dt * 1.5;
    (this.targetRing.material as StandardMaterial).emissiveColor = hex(color);
  }

  private updateHud(tod: number) {
    const room = this.room;
    if (!room?.state?.players) return;
    const p = room.state.players.get(this.sessionId);
    if (p) this.hud.setPlayer(p.name, p.level, p.hp, p.maxHp, p.xp, xpToNextLevel(p.level));
    if (this.target) {
      if (this.target.type === "mob") {
        const m = room.state.mobs.get(this.target.id);
        const e = this.mobs.get(this.target.id);
        if (m && e) this.hud.setTarget({ name: e.kind.name, level: e.kind.level, hp: m.hp, maxHp: m.maxHp, color: conColor(e.kind.level, p?.level ?? 1) });
      } else {
        const t = room.state.players.get(this.target.id);
        if (t) this.hud.setTarget({ name: t.name, level: t.level, hp: t.hp, maxHp: t.maxHp, color: "#8fd0ff" });
      }
    }
    const now = performance.now();
    this.hud.setCooldown(1, 1 - (now - this.lastAttack) / ATTACK_COOLDOWN_MS, this.autoAttack);
    this.hud.setCooldown(2, 1 - (now - this.lastHeal) / HEAL_COOLDOWN_MS);
    const c = clockLabel(tod);
    this.hud.setClock(c.icon, c.text);
    this.hud.setCoords(this.pos.x, this.pos.z);

    const dots: MapDot[] = [];
    room.state.mobs.forEach((m: any, id: string) => {
      if (m.mode === 3) return;
      const kind = MOB_KINDS[m.kind as MobKindId];
      dots.push({ x: m.x, z: m.z, color: this.target?.id === id ? "#ffffff" : conColor(kind.level, p?.level ?? 1), size: kind.boss ? 5 : 3 });
    });
    room.state.players.forEach((o: any, id: string) => {
      if (id !== this.sessionId) dots.push({ x: o.x, z: o.z, color: "#5ab8ff", size: 4 });
    });
    this.minimap.draw(this.pos.x, this.pos.z, this.me?.facing ?? 0, this.camera.alpha, dots);
  }

  /** Accès de débogage (tests automatisés). */
  debugWalkTo(x: number, z: number) {
    this.autopilot = { x, z };
  }

  debugAmbiance(id: string | null) {
    this.setAmbiance(id);
    return this.world?.biome?.id;
  }

  debugTime(t: number | null) {
    this.timeOverride = t;
  }

  debugCamera(alpha: number, beta: number, radius: number) {
    this.camera.alpha = alpha;
    this.camera.beta = beta;
    this.camera.radius = radius;
  }

  debugKey(code: string) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code }));
  }

  debug() {
    return {
      mode: this.mode,
      zone: this.zoneId,
      pos: this.pos.clone(),
      players: this.room?.state?.players?.size ?? 0,
      mobs: this.mobs.size,
      fps: this.engine.getFps(),
    };
  }
}

function nodeAt(scene: Scene, p: Vector3) {
  const m = new Mesh("anchor", scene);
  m.position.copyFrom(p);
  m.isPickable = false;
  return m;
}
