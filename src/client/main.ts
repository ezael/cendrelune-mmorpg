/** Point d'entrée du client : écran de création du personnage puis lancement du jeu. */
import { Game } from "./game.js";
import { MAX_NAME_LENGTH, TUNIC_COLORS } from "../shared/rules.js";
import {
  COIFFURES, NOMS_COIFFURES, RACES, RACE_IDS, apparenceParDefaut, encoderApparence, nettoyerApparence,
  type Apparence, type CorpsId, type RaceId,
} from "../shared/apparence.js";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const game = new Game(canvas);
(window as any).__game = game;

const $ = (id: string) => document.getElementById(id)!;
const nameInput = $("name") as HTMLInputElement;
const play = $("play") as HTMLButtonElement;
const status = $("title-status");

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
};

const NAMES = ["Aldric", "Maelis", "Brennor", "Ysolde", "Thoren", "Lirael", "Garwin", "Elowen", "Corvin", "Seren"];
nameInput.value = store.get("cendrelune.name") ?? NAMES[Math.floor(Math.random() * NAMES.length)];

const ancienneCouleur = store.get("cendrelune.color");
const tenueInitiale = ancienneCouleur && TUNIC_COLORS.includes(ancienneCouleur) ? ancienneCouleur : TUNIC_COLORS[Math.floor(Math.random() * 4)];
let look: Apparence = store.get("cendrelune.look")
  ? nettoyerApparence(store.get("cendrelune.look"), tenueInitiale)
  : apparenceParDefaut("humain", Math.random() < 0.5 ? "homme" : "femme", tenueInitiale);

// ---------------------------------------------------------------------------
// Construction de l'interface
// ---------------------------------------------------------------------------

function swatches(el: HTMLElement, colors: string[], selected: number, onPick: (i: number) => void) {
  el.innerHTML = "";
  colors.forEach((c, i) => {
    const s = document.createElement("div");
    s.className = "swatch" + (i === selected ? " selected" : "");
    s.style.background = c;
    s.addEventListener("click", () => onPick(i));
    el.appendChild(s);
  });
}

function seg(el: HTMLElement, options: Array<[string, string]>, value: string, onPick: (v: string) => void) {
  el.innerHTML = "";
  for (const [v, label] of options) {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = v === value ? "selected" : "";
    b.addEventListener("click", () => onPick(v));
    el.appendChild(b);
  }
}

function render() {
  const race = RACES[look.race];
  // peuples
  const races = $("races");
  races.innerHTML = "";
  for (const id of RACE_IDS) {
    const r = RACES[id];
    const b = document.createElement("button");
    b.className = "race-btn" + (id === look.race ? " selected" : "");
    b.innerHTML = `<b>${r.pluriel}</b><small>${r.devise}</small>`;
    b.addEventListener("click", () => changerRace(id));
    races.appendChild(b);
  }
  $("race-desc").textContent = race.description;
  $("rb-name").textContent = race.pluriel;
  $("rb-motto").textContent = race.devise;
  seg($("corps"), [["homme", "Homme"], ["femme", "Femme"]], look.corps, (v) => changerCorps(v as CorpsId));
  $("barbe-field").style.visibility = look.corps === "homme" ? "visible" : "hidden";
  seg($("barbe"), [["non", "Sans"], ["oui", "Avec"]], look.barbe ? "oui" : "non", (v) => maj({ barbe: v === "oui" }));
  swatches($("peaux"), race.peaux, look.peau, (i) => maj({ peau: i }));
  swatches($("cheveux"), race.cheveux, look.cheveux, (i) => maj({ cheveux: i }));
  swatches($("swatches"), TUNIC_COLORS, TUNIC_COLORS.indexOf(look.tenue), (i) => maj({ tenue: TUNIC_COLORS[i] }));
  $("coif-name").textContent = NOMS_COIFFURES[look.coiffure];
}

let apercuEnCours: Promise<void> = Promise.resolve();
function apercu() {
  const a = { ...look };
  apercuEnCours = apercuEnCours.then(() => game.showPreview(a)).catch((e) => console.error(e));
}

function maj(p: Partial<Apparence>) {
  look = nettoyerApparence({ ...look, ...p }, look.tenue);
  store.set("cendrelune.look", encoderApparence(look));
  render();
  apercu();
}

function changerRace(race: RaceId) {
  const d = apparenceParDefaut(race, look.corps, look.tenue);
  maj({ ...d });
}

function changerCorps(corps: CorpsId) {
  const r = RACES[look.race];
  maj({ corps, coiffure: r.coiffureDefaut[corps], barbe: corps === "homme" && r.barbeDefaut });
}

function coiffure(delta: number) {
  const i = COIFFURES.indexOf(look.coiffure);
  maj({ coiffure: COIFFURES[(i + delta + COIFFURES.length) % COIFFURES.length] });
}
$("coif-prev").addEventListener("click", () => coiffure(-1));
$("coif-next").addEventListener("click", () => coiffure(1));

$("random").addEventListener("click", () => {
  const race = RACE_IDS[Math.floor(Math.random() * RACE_IDS.length)];
  const r = RACES[race];
  const corps: CorpsId = Math.random() < 0.5 ? "homme" : "femme";
  const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
  maj({
    race, corps,
    peau: Math.floor(Math.random() * r.peaux.length),
    cheveux: Math.floor(Math.random() * r.cheveux.length),
    coiffure: pick(COIFFURES.filter((c) => c !== "aucune" || Math.random() < 0.3)),
    barbe: corps === "homme" && (r.barbeDefaut || Math.random() < 0.35),
    tenue: pick(TUNIC_COLORS),
  });
});

render();
apercu();

// ---------------------------------------------------------------------------
// Entrée dans le jeu
// ---------------------------------------------------------------------------

async function enter() {
  const name = nameInput.value.trim().slice(0, MAX_NAME_LENGTH);
  if (name.length < 2) {
    status.textContent = "Choisis un nom d'au moins 2 lettres.";
    return;
  }
  store.set("cendrelune.name", name);
  store.set("cendrelune.color", look.tenue);
  store.set("cendrelune.look", encoderApparence(look));
  play.disabled = true;
  status.textContent = "";
  $("title").classList.add("hidden");
  try {
    await apercuEnCours;
    await game.start(name, look);
  } catch (err) {
    console.error(err);
    $("title").classList.remove("hidden");
    status.textContent = "Impossible de joindre le serveur. Est-il bien lancé ?";
    play.disabled = false;
    apercu();
  }
}

play.addEventListener("click", enter);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") enter();
});
