/**
 * Ciel, soleil, lune et cycle jour/nuit des zones extérieures.
 */
import {
  CascadedShadowGenerator, Color3, DirectionalLight, Effect, HemisphericLight, Mesh, MeshBuilder,
  Scene, ShaderMaterial, Vector3,
} from "@babylonjs/core";
import { hex } from "./kit.js";
import type { Biome } from "./biomes.js";
import { LOW_QUALITY } from "../quality.js";

Effect.ShadersStore["skyVertexShader"] = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

Effect.ShadersStore["skyFragmentShader"] = `
precision highp float;
varying vec3 vDir;
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 bottomColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 moonDir;
uniform float night;
uniform float time;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, bottomColor, clamp(-h * 4.0, 0.0, 1.0));

  // Soleil : disque + halo
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35);

  // Lune
  float m = max(dot(d, normalize(moonDir)), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, m) * 1.6 + pow(m, 40.0) * 0.12) * night;

  // Étoiles scintillantes
  if (night > 0.01 && h > 0.0) {
    vec3 cell = floor(d * 260.0);
    float st = hash(cell);
    float tw = 0.6 + 0.4 * sin(time * 2.0 + st * 40.0);
    col += vec3(step(0.9965, st) * tw * night * smoothstep(0.0, 0.25, h));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

interface SkyKey {
  t: number;
  top: string;
  horizon: string;
  sun: string;
  fog: string;
  sunI: number;
  hemiI: number;
  hemiSky: string;
  hemiGround: string;
}

// Images clés de la journée : nuit, aube, jour, crépuscule.
const KEYS: SkyKey[] = [
  { t: 0.0, top: "#060a1f", horizon: "#16224a", sun: "#9db4ff", fog: "#0f1834", sunI: 0.28, hemiI: 0.35, hemiSky: "#5a6fb0", hemiGround: "#141a2e" },
  { t: 0.2, top: "#0b1430", horizon: "#2a3060", sun: "#9db4ff", fog: "#1a2142", sunI: 0.22, hemiI: 0.38, hemiSky: "#5a6fb0", hemiGround: "#161b2e" },
  { t: 0.26, top: "#3d5aa8", horizon: "#ff9a6a", sun: "#ffb27a", fog: "#d99a86", sunI: 0.9, hemiI: 0.55, hemiSky: "#ffd2b0", hemiGround: "#4a3a3a" },
  { t: 0.33, top: "#4f8fe0", horizon: "#bfe0ff", sun: "#fff1d6", fog: "#b8d4ec", sunI: 1.9, hemiI: 0.75, hemiSky: "#cfe6ff", hemiGround: "#5d5a3e" },
  { t: 0.67, top: "#4f8fe0", horizon: "#c4e2ff", sun: "#fff1d6", fog: "#bcd6ee", sunI: 1.9, hemiI: 0.75, hemiSky: "#cfe6ff", hemiGround: "#5d5a3e" },
  { t: 0.74, top: "#3a4c9a", horizon: "#ff8355", sun: "#ff9a5a", fog: "#cc8070", sunI: 0.95, hemiI: 0.55, hemiSky: "#ffb89a", hemiGround: "#3f3036" },
  { t: 0.8, top: "#0b1430", horizon: "#2a3060", sun: "#9db4ff", fog: "#1a2142", sunI: 0.22, hemiI: 0.38, hemiSky: "#5a6fb0", hemiGround: "#161b2e" },
  { t: 1.0, top: "#060a1f", horizon: "#16224a", sun: "#9db4ff", fog: "#0f1834", sunI: 0.28, hemiI: 0.35, hemiSky: "#5a6fb0", hemiGround: "#141a2e" },
];

function sample(t: number) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = (t - a.t) / (b.t - a.t);
  const mix = (x: string, y: string) => Color3.Lerp(hex(x), hex(y), k);
  return {
    top: mix(a.top, b.top),
    horizon: mix(a.horizon, b.horizon),
    sun: mix(a.sun, b.sun),
    fog: mix(a.fog, b.fog),
    hemiSky: mix(a.hemiSky, b.hemiSky),
    hemiGround: mix(a.hemiGround, b.hemiGround),
    sunI: a.sunI + (b.sunI - a.sunI) * k,
    hemiI: a.hemiI + (b.hemiI - a.hemiI) * k,
  };
}

export class Atmosphere {
  readonly sun: DirectionalLight;
  readonly hemi: HemisphericLight;
  readonly shadows: CascadedShadowGenerator;
  private sky: Mesh;
  private mat: ShaderMaterial;
  private elapsed = 0;
  /** 0 en plein jour, 1 en pleine nuit : sert aux fenêtres, lanternes et lucioles. */
  night = 0;

  private tint: {
    top: Color3; topK: number; horizon: Color3; horizonK: number; fog: Color3; fogK: number;
    sun: Color3; sunK: number; sunPower: number; fogDensity: number;
  };

  constructor(private scene: Scene, biome?: Biome) {
    const s = biome?.sky;
    this.tint = {
      top: hex(s?.tint ?? "#4f8fe0"), topK: s?.amount ?? 0,
      horizon: hex(s?.horizonTint ?? "#ffffff"), horizonK: s?.horizonAmount ?? 0,
      fog: hex(s?.fogTint ?? "#ffffff"), fogK: s?.fogAmount ?? 0,
      sun: hex(s?.sunTint ?? "#ffffff"), sunK: s?.sunAmount ?? 0,
      sunPower: s?.sunPower ?? 1, fogDensity: s?.fogDensity ?? 0.0075,
    };
    this.hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
    this.sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.3), scene);
    this.sun.position = new Vector3(60, 120, 40);
    this.sun.shadowMinZ = -150;
    this.sun.shadowMaxZ = 150;

    this.shadows = new CascadedShadowGenerator(LOW_QUALITY ? 512 : 2048, this.sun);
    this.shadows.numCascades = LOW_QUALITY ? 2 : 3;
    this.shadows.shadowMaxZ = 90;
    this.shadows.lambda = 0.82;
    this.shadows.stabilizeCascades = true;
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = LOW_QUALITY ? CascadedShadowGenerator.QUALITY_LOW : CascadedShadowGenerator.QUALITY_MEDIUM;
    this.shadows.bias = 0.004;
    this.shadows.normalBias = 0.02;
    this.shadows.darkness = 0.25;
    this.shadows.transparencyShadow = false;

    this.sky = MeshBuilder.CreateSphere("sky", { diameter: 900, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
    this.sky.infiniteDistance = true;
    this.sky.isPickable = false;
    this.mat = new ShaderMaterial("skyMat", scene, "sky", {
      attributes: ["position"],
      uniforms: ["worldViewProjection", "topColor", "horizonColor", "bottomColor", "sunDir", "sunColor", "moonDir", "night", "time"],
    });
    this.mat.backFaceCulling = false;
    this.mat.disableDepthWrite = true;
    this.sky.material = this.mat;
    this.sky.applyFog = false;
    this.sky.renderingGroupId = 0;

    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = this.tint.fogDensity;
  }

  update(dt: number, timeOfDay: number) {
    this.elapsed += dt;
    const c = sample(timeOfDay);
    // Teinte de l'ambiance : forte le jour, adoucie la nuit pour garder un ciel nocturne lisible.
    const day = Math.max(0, Math.min(1, (Math.sin((timeOfDay - 0.25) * Math.PI * 2) + 0.15) * 2));
    const t = this.tint;
    const dk = 0.35 + 0.65 * day;
    const tintTo = (col: Color3, target: Color3, k: number) => {
      // Garde la luminosité de la clé de ciel, applique la couleur de l'ambiance.
      const lum = col.r * 0.3 + col.g * 0.59 + col.b * 0.11;
      const tl = target.r * 0.3 + target.g * 0.59 + target.b * 0.11 || 1;
      return Color3.Lerp(col, target.scale(lum / tl), k * dk);
    };
    c.top = tintTo(c.top, t.top, t.topK);
    c.horizon = tintTo(c.horizon, t.horizon, t.horizonK);
    c.fog = tintTo(c.fog, t.fog, t.fogK);
    c.sun = Color3.Lerp(c.sun, t.sun, t.sunK * dk);
    c.hemiSky = Color3.Lerp(c.hemiSky, c.fog, 0.25 * t.fogK);
    c.sunI *= 1 - (1 - t.sunPower) * day;

    // Le soleil fait le tour du ciel ; la lune est à l'opposé.
    const a = (timeOfDay - 0.25) * Math.PI * 2;
    const sunDir = new Vector3(Math.cos(a) * 0.75, Math.sin(a), 0.45).normalize();
    const moonDir = sunDir.scale(-1);
    const isDay = sunDir.y > -0.05;
    const lightFrom = isDay ? sunDir : moonDir;
    // On évite une lumière rasante qui étirerait les ombres à l'infini.
    const from = new Vector3(lightFrom.x, Math.max(0.28, lightFrom.y), lightFrom.z).normalize();
    this.sun.direction = from.scale(-1);
    this.sun.intensity = c.sunI;
    this.sun.diffuse = c.sun;
    this.sun.specular = c.sun.scale(0.3);

    this.hemi.intensity = c.hemiI;
    this.hemi.diffuse = c.hemiSky;
    this.hemi.groundColor = c.hemiGround;

    this.night = Math.max(0, Math.min(1, (0.05 - sunDir.y) * 4));

    this.mat.setColor3("topColor", c.top);
    this.mat.setColor3("horizonColor", c.horizon);
    this.mat.setColor3("bottomColor", c.fog.scale(0.8));
    this.mat.setVector3("sunDir", sunDir);
    this.mat.setColor3("sunColor", isDay ? c.sun : Color3.Black());
    this.mat.setVector3("moonDir", moonDir);
    this.mat.setFloat("night", this.night);
    this.mat.setFloat("time", this.elapsed);

    this.scene.fogColor = c.fog;
    this.scene.clearColor.set(c.fog.r, c.fog.g, c.fog.b, 1);
    this.scene.ambientColor = c.hemiGround.scale(0.6);
  }

  dispose() {
    this.shadows.dispose();
    this.sky.dispose();
    this.mat.dispose();
    this.sun.dispose();
    this.hemi.dispose();
  }
}

/** Nom de l'heure, pour l'interface. */
export function clockLabel(timeOfDay: number): { text: string; icon: string } {
  const minutes = Math.floor(timeOfDay * 24 * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  const day = timeOfDay > 0.24 && timeOfDay < 0.77;
  return { text: `${hh}:${mm}`, icon: day ? "☀" : "☾" };
}
