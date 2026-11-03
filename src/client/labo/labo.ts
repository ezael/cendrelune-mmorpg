/**
 * LABO : planche de comparaison des styles de personnages, dans la Clairière.
 * Ouvrir /labo.html  (paramètres : ?heure=0.5  ?scene=styles|races|foule  ?cam=face|trois-quarts)
 */
import {
  ArcRotateCamera, DefaultRenderingPipeline, Engine, ImageProcessingConfiguration, Scene, Vector3,
} from "@babylonjs/core";
import { buildOutdoor } from "../world/outdoor.js";
import { heightAt } from "../../shared/zones.js";
import { Character } from "../entities/character.js";
import { PersoCC0, type OptionsPerso, type Style, type Anim } from "./personnage-cc0.js";
import { Avatar } from "../entities/avatar.js";
import { RACE_IDS, apparenceParDefaut, type CorpsId } from "../../shared/apparence.js";

const params = new URLSearchParams(location.search);
const heure = Number(params.get("heure") ?? "0.45");
const mode = params.get("scene") ?? "styles";

const canvas = document.getElementById("labo") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { stencil: true, antialias: true, preserveDrawingBuffer: true }, true);
const scene = new Scene(engine);
const world = buildOutdoor(scene);

const cx = 5, cz = 2;
const gy = (x: number, z: number) => heightAt("clairiere", x, z);

const cam = new ArcRotateCamera("cam", Math.PI / 2, 1.4, 7.2, new Vector3(cx, gy(cx, cz) + 1.0, cz), scene);
cam.minZ = 0.05;
cam.fov = 0.7;
cam.attachControl(canvas, true);

const pp = new DefaultRenderingPipeline("pp", true, scene, [cam]);
pp.samples = 4;
pp.fxaaEnabled = true;
pp.bloomEnabled = true;
pp.bloomThreshold = 0.72;
pp.bloomWeight = 0.32;
pp.imageProcessingEnabled = true;
pp.imageProcessing.toneMappingEnabled = true;
pp.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
pp.imageProcessing.exposure = 1.15;
pp.imageProcessing.contrast = 1.18;
pp.imageProcessing.vignetteEnabled = true;
pp.imageProcessing.vignetteWeight = 2.2;

const TENUE_ROUGE = { tunique: "#9a2b2b", pantalon: "#3f342b", bottes: "#3b2a1e", ceinture: "#5a3a22" };
const TENUE_VERTE = { tunique: "#3f6b3a", pantalon: "#4a3a2e", bottes: "#33261b", ceinture: "#6b4a2a" };

function base(style: Style, femme = false): OptionsPerso {
  return femme
    ? { corps: "femme", style, pieces: ["Hair_Long", "Eyebrows_Female"], peau: "#e9bf98", cheveux: "#7a4424", tenue: TENUE_VERTE }
    : { corps: "homme", style, pieces: ["Hair_SimpleParted", "Eyebrows_Regular"], peau: "#e2b089", cheveux: "#3b2416", tenue: TENUE_ROUGE };
}

async function placer(name: string, o: OptionsPerso, dx: number, dz = 0, anim: Anim = "repos", yaw = 0, outline = false) {
  const p = await PersoCC0.creer(scene, name, o);
  const x = cx + dx, z = cz + dz;
  p.setPosition(x, gy(x, z), z, yaw);
  p.play(anim, true, Math.random());
  p.addToShadows(world.shadows);
  if (outline) p.setOutline(true);
  return p;
}

function ancien(dx: number, dz = 0) {
  const c = new Character(scene, "Thierry", "#9a2b2b");
  const x = cx + dx, z = cz + dz;
  c.root.position.set(x, gy(x, z), z);
  c.addToShadows(world.shadows);
  return c;
}

const avatars: Avatar[] = [];
async function monter() {
  const anciens: Character[] = [];
  if (mode === "styles") {
    // Rangée : actuel | stylisé | intermédiaire | semi-réaliste   (homme devant, femme derrière)
    anciens.push(ancien(-3.0));
    await placer("st_h", base("stylise"), -1.0, 0, "repos", 0, true);
    await placer("in_h", base("intermediaire"), 1.0);
    await placer("sr_h", base("semi-realiste"), 3.0);
    await placer("st_f", base("stylise", true), -0.3, 1.6, "repos", 0, true);
    await placer("in_f", base("intermediaire", true), 1.7, 1.6);
    await placer("sr_f", base("semi-realiste", true), 3.7, 1.6);
    cam.target.x = cx + 0.4;
    cam.radius = 8.2;
  } else if (mode === "portrait") {
    const style = params.get("style") ?? "intermediaire";
    if (style === "actuel") {
      anciens.push(ancien(0.55));
      const c2 = new Character(scene, "Maelis", "#3f6b3a");
      c2.root.position.set(cx - 0.55, gy(cx - 0.55, cz), cz);
      c2.addToShadows(world.shadows);
      anciens.push(c2);
    } else {
      const s = style as Style;
      await placer("h", base(s), 0.55, 0, "repos", 0, s === "stylise");
      await placer("f", base(s, true), -0.55, 0, "repos", 0, s === "stylise");
    }
    cam.radius = 4.2;
    cam.beta = 1.42;
    cam.target.y = gy(cx, cz) + 0.95;
  } else if (mode === "races") {
    const style = (params.get("style") as Style) ?? "intermediaire";
    const ol = style === "stylise";
    await placer("hum", base(style), -1.0, 0, "repos", 0, ol);
    await placer("nain", { ...base(style), race: "nain", pieces: ["Hair_SimpleParted", "Hair_Beard", "Eyebrows_Regular"], cheveux: "#8a3b1e", tenue: { tunique: "#5b4a7a", pantalon: "#3a3530", bottes: "#2a2018", ceinture: "#8a6a2a" } }, 0.2, 0, "repos", 0, ol);
    await placer("hum_f", base(style, true), 1.0, 0, "repos", 0, ol);
    cam.radius = 5.0;
    cam.target.y -= 0.2;
  } else if (mode === "avatars") {
    // Les 4 races, homme devant / femme derrière, avec la classe utilisée en jeu
    await Avatar.precharger(scene);
    const anim = params.get("anim") ?? "repos";
    const tenues = ["#c0392b", "#27ae60", "#8e44ad", "#e67e22"];
    RACE_IDS.forEach((race, i) => {
      (["homme", "femme"] as CorpsId[]).forEach((corps, j) => {
        const seul = params.get("seul");
        if (seul && seul !== `${race}_${corps}`) return;
        const a = apparenceParDefaut(race, corps, tenues[i]);
        const av = new Avatar(scene, `${race}_${corps}`, a);
        const x = seul ? cx : cx + (i - 1.5) * 1.35 + (j ? 0.5 : 0), z = seul ? cz : cz + j * 1.3;
        av.setPosition(x, gy(x, z), z);
        av.face(Number(params.get("yaw") ?? "0"), 0, true);
        av.addToShadows(world.shadows);
        avatars.push(av);
      });
    });
    const st = { speed: anim === "course" ? 7 : anim === "marche" ? 1.2 : 0, airborne: false, anim: anim === "assis" ? 5 : 0, dead: anim === "mort" };
    scene.onBeforeRenderObservable.add(() => {
      for (const av of avatars) av.update(engine.getDeltaTime() / 1000, st);
    });
    if (anim === "attaque") setInterval(() => avatars.forEach((a) => a.attack()), 1400);
    if (anim === "sort") setInterval(() => avatars.forEach((a) => a.cast()), 1400);
    cam.radius = params.get("seul") ? 2.6 : 7.5;
    if (!params.get("seul")) { cam.target.x = cx + 0.25; cam.target.z = cz + 0.6; }
    else cam.target.y = gy(cx, cz) + Number(params.get("hy") ?? "1.2");
  } else if (mode === "foule") {
    const n = Number(params.get("n") ?? "30");
    const anims: Anim[] = ["repos", "marche", "course", "parle"];
    for (let i = 0; i < n; i++) {
      const s: Style = (["stylise", "intermediaire", "semi-realiste"] as Style[])[i % 3];
      await placer(`f${i}`, base(s, i % 2 === 1), ((i % 10) - 4.5) * 1.3, -Math.floor(i / 10) * 2.2 - 1, anims[i % 4], Math.random() * 6.28);
    }
    cam.radius = 18;
    cam.beta = 1.15;
  }
  const cv = params.get("cam");
  if (cv === "trois-quarts") cam.alpha = Math.PI / 2 - 0.6;
  if (cv === "dos") cam.alpha = -Math.PI / 2;

  let last = performance.now();
  const fpsEl = document.getElementById("fps")!;
  let frames = 0, acc = 0;
  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    world.update(dt, heure);
    for (const a of anciens) a.update(dt, { speed: 0, airborne: false, anim: 0, dead: false });
    frames++; acc += dt;
    if (acc > 1) { fpsEl.textContent = `${Math.round(frames / acc)} i/s · ${scene.getActiveMeshes().length} maillages`; frames = 0; acc = 0; }
  });
  await scene.whenReadyAsync();
  (window as unknown as { __laboPret: boolean }).__laboPret = true;
}

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
monter().catch((e) => {
  console.error(e);
  document.getElementById("fps")!.textContent = "Erreur : " + e;
});
