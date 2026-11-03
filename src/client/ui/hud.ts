/** Interface HTML par-dessus la 3D : cadres, chat, barre d'actions, bannières. */

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type ChatKind = "chat" | "sys" | "err" | "xp" | "combat" | "heal" | "con";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export class Hud {
  private chatLog = $("chat-log");
  readonly chatInput = $<HTMLInputElement>("chat-input");
  private bannerTimer = 0;
  private centerTimer = 0;

  show() {
    $("hud").classList.remove("hidden");
  }

  hide() {
    $("hud").classList.add("hidden");
  }

  setPlayer(name: string, level: number, hp: number, maxHp: number, xp: number, xpMax: number) {
    $("pf-name").textContent = name;
    $("pf-level").textContent = `Niv. ${level}`;
    $("pf-hp").style.width = `${(100 * Math.max(0, hp)) / maxHp}%`;
    $("pf-hp-text").textContent = `${Math.max(0, hp)} / ${maxHp}`;
    $("pf-xp").style.width = `${(100 * xp) / xpMax}%`;
  }

  setTarget(t: { name: string; level: number; hp: number; maxHp: number; color: string } | null) {
    const frame = $("target-frame");
    if (!t) {
      frame.classList.add("hidden");
      return;
    }
    frame.classList.remove("hidden");
    const n = $("tf-name");
    n.textContent = t.name;
    n.style.color = t.color;
    $("tf-level").textContent = `Niv. ${t.level}`;
    $("tf-hp").style.width = `${(100 * Math.max(0, t.hp)) / t.maxHp}%`;
    $("tf-hp-text").textContent = `${Math.round((100 * Math.max(0, t.hp)) / t.maxHp)} %`;
  }

  setClock(icon: string, text: string) {
    $("clock").textContent = `${icon} ${text}`;
  }

  setZoneLabel(name: string) {
    $("zone-label").textContent = name;
  }

  setCoords(x: number, z: number) {
    $("coords").textContent = `${Math.round(x)}, ${Math.round(z)}`;
  }

  setCooldown(slot: 1 | 2, ratio: number, active = false) {
    const el = $(`slot-${slot}`);
    (el.querySelector(".cd") as HTMLElement).style.setProperty("--cd", `${Math.max(0, Math.min(1, ratio)) * 100}%`);
    el.classList.toggle("active", active);
  }

  banner(name: string, sub: string) {
    const b = $("zone-banner");
    (b.querySelector(".zb-name") as HTMLElement).textContent = name;
    (b.querySelector(".zb-sub") as HTMLElement).textContent = sub;
    b.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.remove("show"), 4200);
  }

  center(text: string, ms = 2500) {
    const c = $("center-msg");
    c.textContent = text;
    c.classList.add("show");
    clearTimeout(this.centerTimer);
    this.centerTimer = window.setTimeout(() => c.classList.remove("show"), ms);
  }

  chat(kind: ChatKind, text: string, from?: { name: string; color: string }) {
    const line = document.createElement("div");
    line.className = `line ${kind}`;
    if (from) {
      line.innerHTML = `<b style="color:${from.color}">${escapeHtml(from.name)}</b> : ${escapeHtml(text)}`;
    } else {
      line.textContent = text;
    }
    this.chatLog.appendChild(line);
    while (this.chatLog.children.length > 120) this.chatLog.firstChild!.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  setDead(dead: boolean) {
    $("death").classList.toggle("hidden", !dead);
  }

  hurtFlash() {
    const f = $("hurt-flash");
    f.classList.add("on");
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove("on")));
  }

  toggleHelp(force?: boolean) {
    $("help").classList.toggle("hidden", force === undefined ? undefined : !force);
  }
}

export class Loading {
  private tips = [
    "Astuce : ouvre un deuxième onglet pour tester le jeu en groupe.",
    "Astuce : l'expérience d'un monstre est partagée entre ceux qui l'ont combattu, avec un bonus de groupe.",
    "Astuce : la couleur du nom d'un monstre indique sa difficulté, du gris (facile) au rouge (dangereux).",
    "Astuce : le Gardien des Échos est bien trop fort pour un aventurier seul.",
    "Astuce : la nuit, les lucioles dansent au-dessus du lac.",
    "Astuce : la touche 2 soigne ta cible amicale, ou toi-même si tu n'en as pas.",
  ];

  show(name: string, sub: string) {
    $("loading-name").textContent = name;
    $("loading-sub").textContent = sub;
    $("loading-tip").textContent = this.tips[Math.floor(Math.random() * this.tips.length)];
    $("loading").classList.remove("hidden");
  }

  hide() {
    $("loading").classList.add("hidden");
  }
}
