/** Point d'entrée du client : écran titre puis lancement du jeu. */
import { Game } from "./game.js";
import { MAX_NAME_LENGTH, TUNIC_COLORS } from "../shared/rules.js";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const game = new Game(canvas);
(window as any).__game = game;

const nameInput = document.getElementById("name") as HTMLInputElement;
const swatches = document.getElementById("swatches")!;
const play = document.getElementById("play") as HTMLButtonElement;
const status = document.getElementById("title-status")!;

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
};

const NAMES = ["Aldric", "Maelis", "Brennor", "Ysolde", "Thoren", "Lirael", "Garwin", "Elowen", "Corvin", "Seren"];
nameInput.value = store.get("cendrelune.name") ?? NAMES[Math.floor(Math.random() * NAMES.length)];
let color = store.get("cendrelune.color") ?? TUNIC_COLORS[Math.floor(Math.random() * 4)];
if (!TUNIC_COLORS.includes(color)) color = TUNIC_COLORS[0];

for (const c of TUNIC_COLORS) {
  const s = document.createElement("div");
  s.className = "swatch" + (c === color ? " selected" : "");
  s.style.background = c;
  s.addEventListener("click", () => {
    color = c;
    swatches.querySelectorAll(".swatch").forEach((el) => el.classList.remove("selected"));
    s.classList.add("selected");
  });
  swatches.appendChild(s);
}

async function enter() {
  const name = nameInput.value.trim().slice(0, MAX_NAME_LENGTH);
  if (name.length < 2) {
    status.textContent = "Choisis un nom d'au moins 2 lettres.";
    return;
  }
  store.set("cendrelune.name", name);
  store.set("cendrelune.color", color);
  play.disabled = true;
  status.textContent = "";
  document.getElementById("title")!.classList.add("hidden");
  try {
    await game.start(name, color);
  } catch (err) {
    console.error(err);
    document.getElementById("title")!.classList.remove("hidden");
    status.textContent = "Impossible de joindre le serveur. Est-il bien lancé ?";
    play.disabled = false;
  }
}

play.addEventListener("click", enter);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") enter();
});
