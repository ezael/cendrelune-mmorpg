/**
 * Matériaux « peints en code » : on garde le StandardMaterial de Babylon (lumières,
 * ombres, brume) et on lui greffe nos propres morceaux de shader.
 *
 * - TerrainPlugin : le sol. Mélange herbe, sous-bois, terre, pavés, roche, sable et
 *   neige selon une carte de mélange (chemins, place, prairies sèches, forêt), la
 *   pente et l'altitude, avec du bruit pour casser les répétitions.
 * - WindPlugin : fait onduler les herbes et les fleurs au vent.
 */
import {
  Color3, MaterialPluginBase, RawTexture, Scene, StandardMaterial, Texture,
  type AbstractEngine, type Material, type SubMesh, type UniformBuffer,
} from "@babylonjs/core";
import type { Biome } from "./biomes.js";
import { hex } from "./kit.js";

const COLOR_UNIFORMS = [
  "tGrassA", "tGrassB", "tGrassDry", "tMoss", "tDirt", "tDirtDark", "tCobble",
  "tRock", "tRockDark", "tSand", "tLakebed", "tSnow", "tEmber",
] as const;

const TERRAIN_GLSL_FUNCS = /* glsl */ `
float t_hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float t_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(t_hash(i), t_hash(i + vec2(1.0, 0.0)), u.x),
             mix(t_hash(i + vec2(0.0, 1.0)), t_hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float t_fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * t_noise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s / 0.9375;
}
// Voronoï : x = distance à la cellule, y = distance au bord, z = identifiant de cellule.
vec3 t_voronoi(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(t_hash(i + g), t_hash(i + g + 19.7));
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = t_hash(i + g + 3.1); }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}
`;

/**
 * Le corps du shader de sol. Entrées : vPositionW, normalW, vEyePosition.
 * Sorties : baseColor.rgb (albédo) et tGlow (lueur ajoutée après l'éclairage).
 */
const TERRAIN_GLSL_MAIN = /* glsl */ `
  vec3 tP = vPositionW;
  vec2 xz = tP.xz;
  float tDist = length(vEyePosition.xyz - tP);
  // Les petits détails s'estompent au loin pour éviter le scintillement.
  float fine = 1.0 - smoothstep(18.0, 70.0, tDist);
  float midf = 1.0 - smoothstep(60.0, 160.0, tDist);
  vec4 splat = texture2D(splatSampler, xz / tParams.w + 0.5);

  float macro = t_fbm(xz * 0.03);
  float meso = t_fbm(xz * 0.17 + 7.0);
  float micro = mix(0.5, t_noise(xz * 3.1) * 0.6 + t_noise(xz * 8.3) * 0.4, fine);
  float streak = mix(0.5, t_noise(vec2(xz.x * 0.9 + xz.y * 0.35, xz.y * 5.5 - xz.x * 1.2)), fine);

  // --- Herbe : trois tons de vert, prairies sèches, sous-bois moussu
  vec3 grass = mix(tGrassA, tGrassB, smoothstep(0.28, 0.72, macro * 0.65 + meso * 0.35));
  grass = mix(grass, tGrassDry, clamp(splat.b * smoothstep(0.3, 0.6, meso + macro * 0.3), 0.0, 1.0));
  grass = mix(grass, tMoss, splat.a * (0.55 + 0.35 * meso));
  grass *= 0.84 + 0.22 * micro + 0.1 * (streak - 0.5);
  // Touffes plus claires, comme des coups de pinceau
  grass = mix(grass, tGrassB * 1.15, smoothstep(0.72, 0.9, t_noise(xz * 0.9 + 3.0)) * 0.35 * midf);

  // --- Chemins de terre, bords irréguliers, cailloux
  float pathN = splat.r + (meso - 0.5) * 0.35 + (micro - 0.5) * 0.12;
  float pathW = smoothstep(0.38, 0.56, pathN);
  vec3 dirt = mix(tDirtDark, tDirt, 0.45 + 0.55 * meso);
  // Ornières plus sombres au cœur du chemin, bords tassés plus clairs
  dirt = mix(dirt, tDirtDark, smoothstep(0.75, 0.95, splat.r) * 0.25 * (0.5 + streak));
  vec3 peb = t_voronoi(xz * 2.4);
  float pebble = smoothstep(0.26, 0.14, peb.x) * step(0.72, peb.z) * fine;
  dirt = mix(dirt, mix(tRock, tDirt, 0.55) * (0.85 + 0.3 * peb.z), pebble * 0.6);
  dirt *= 0.9 + 0.18 * micro;

  // --- Pavés de la place du village (joints moussus)
  vec3 cv = t_voronoi(xz * 1.6);
  float joint = smoothstep(0.02, 0.07, cv.y);
  vec3 cob = tCobble * (0.8 + 0.3 * cv.z) * (0.92 + 0.12 * micro);
  // Pierres légèrement bombées : plus claires au centre
  cob *= 1.06 - smoothstep(0.0, 0.6, cv.x) * 0.12;
  cob = mix(mix(tDirtDark, tCobble, 0.35), cob, joint);
  cob = mix(cob, tMoss, (1.0 - joint) * 0.45 * t_noise(xz * 0.6));
  float plazaW = smoothstep(0.42, 0.62, splat.g + (micro - 0.5) * 0.2 + (meso - 0.5) * 0.15);

  // --- Roche sur les pentes : strates et fissures
  float slope = 1.0 - normalW.y;
  float rockW = smoothstep(0.2, 0.32, slope + (meso - 0.5) * 0.16);
  vec2 rp = vec2(tP.x * 0.7 + tP.z * 0.7, tP.y * 1.4);
  float strata = sin(tP.y * 1.9 + t_noise(xz * 0.25) * 5.0) * 0.5 + 0.5;
  vec3 rk = t_voronoi(rp * 0.55 + xz * 0.15);
  vec3 rock = mix(tRockDark, tRock, strata * 0.55 + 0.45 * meso);
  float crack = 1.0 - smoothstep(0.0, 0.07, rk.y);
  crack *= midf;
  rock *= 1.0 - crack * 0.4;
  rock *= 0.9 + 0.16 * micro;

  // --- Rives : sable ridé, sol mouillé, fond du lac
  float shoreH = tP.y - tParams.z;
  float sandW = 1.0 - smoothstep(0.3, 0.85, shoreH + (meso - 0.5) * 0.45);
  vec3 sand = tSand * (0.93 + 0.08 * sin(dot(xz, vec2(1.7, 0.9)) * 2.6 + meso * 7.0)) * (0.95 + 0.08 * micro);
  float bedW = 1.0 - smoothstep(-1.8, -0.35, shoreH);

  // --- Neige : sols plats + sommets
  float flatness = smoothstep(0.62, 0.82, normalW.y + (meso - 0.5) * 0.25);
  float snowW = tParams.x * flatness * smoothstep(0.25, 0.45, meso * 0.6 + macro * 0.4 + 0.2);
  snowW = max(snowW, smoothstep(tParams.y, tParams.y + 4.0, tP.y + (macro - 0.5) * 7.0) * smoothstep(0.35, 0.6, normalW.y));
  snowW *= 1.0 - pathW * 0.55 - plazaW * 0.35;
  // Congères : ondulations douces sculptées par le vent
  float drift = sin(dot(xz, vec2(0.21, 0.13)) + meso * 5.0) * 0.5 + 0.5;
  vec3 snow = tSnow * (0.84 + 0.1 * meso + 0.06 * drift + 0.03 * micro);
  // Paillettes de givre
  snow += vec3(0.35) * step(0.992, t_hash(floor(xz * 30.0))) * fine;
  // Ombre bleutée dans les creux de neige
  snow = mix(snow, snow * vec3(0.74, 0.82, 0.98), smoothstep(0.55, 0.2, meso * 0.7 + drift * 0.3) * 0.6);
  // Traces de pas et de traîneaux sur les chemins enneigés
  snow = mix(snow, snow * vec3(0.8, 0.84, 0.92), pathW * 0.6 * (0.5 + 0.5 * streak));

  vec3 tCol = grass;
  tCol = mix(tCol, dirt, pathW);
  tCol = mix(tCol, cob, plazaW);
  tCol = mix(tCol, sand, sandW * (1.0 - plazaW));
  tCol = mix(tCol, tLakebed * (0.85 + 0.25 * meso), bedW);
  tCol = mix(tCol, rock, rockW * (1.0 - plazaW));
  tCol = mix(tCol, snow, clamp(snowW, 0.0, 1.0));
  // Bande de sol mouillé au bord de l'eau
  float wet = (1.0 - smoothstep(0.0, 0.4, shoreH)) * (1.0 - bedW);
  tCol *= 1.0 - wet * 0.3;

  // --- Lueur des braises dans les fissures (Terres de cendre)
  float glowMask = (crack * rockW + pebble * pathW * 0.2 + (1.0 - joint) * plazaW * 0.5) * (1.0 - snowW);
  glowMask += smoothstep(0.9, 0.97, t_noise(xz * 1.7 + 11.0)) * smoothstep(0.6, 0.8, t_noise(xz * 0.2)) * (1.0 - rockW) * 0.6;
  float pulse = 0.65 + 0.35 * sin(tTime * 1.7 + macro * 20.0);
  tGlow = tEmber * glowMask * pulse;

  baseColor.rgb = tCol;
`;

/** Plugin de sol greffé sur un StandardMaterial. */
export class TerrainPlugin extends MaterialPluginBase {
  colors: Record<(typeof COLOR_UNIFORMS)[number], Color3>;
  params: [number, number, number, number];
  time = 0;

  constructor(material: Material, biome: Biome, private splat: Texture, waterLevel: number, size: number) {
    super(material, "CendreluneTerrain", 200, { CDL_TERRAIN: false });
    const g = biome.ground;
    this.colors = {
      tGrassA: hex(g.grassA), tGrassB: hex(g.grassB), tGrassDry: hex(g.grassDry), tMoss: hex(g.moss),
      tDirt: hex(g.dirt), tDirtDark: hex(g.dirtDark), tCobble: hex(g.cobble), tRock: hex(g.rock),
      tRockDark: hex(g.rockDark), tSand: hex(g.sand), tLakebed: hex(g.lakebed), tSnow: hex(g.snow),
      tEmber: hex(g.emberGlow).scale(1.6),
    };
    this.params = [g.snowCover, g.snowLine, waterLevel, size];
    this._enable(true);
  }

  getClassName() {
    return "CendreluneTerrainPlugin";
  }

  isCompatible(lang: number) {
    return lang === 0; // GLSL (WebGL)
  }

  prepareDefines(defines: any) {
    defines.CDL_TERRAIN = true;
  }

  getSamplers(samplers: string[]) {
    samplers.push("splatSampler");
  }

  getActiveTextures(list: any[]) {
    list.push(this.splat);
  }

  getUniforms() {
    const ubo = [
      ...COLOR_UNIFORMS.map((name) => ({ name, size: 3, type: "vec3" })),
      { name: "tParams", size: 4, type: "vec4" },
      { name: "tTime", size: 1, type: "float" },
    ];
    const decl = COLOR_UNIFORMS.map((n) => `uniform vec3 ${n};`).join("\n");
    return {
      ubo,
      fragment: `#ifdef CDL_TERRAIN\n${decl}\nuniform vec4 tParams;\nuniform float tTime;\n#endif`,
    };
  }

  bindForSubMesh(ubo: UniformBuffer, _scene: Scene, _engine: AbstractEngine, _sub: SubMesh) {
    for (const n of COLOR_UNIFORMS) ubo.updateColor3(n, this.colors[n]);
    ubo.updateFloat4("tParams", ...this.params);
    ubo.updateFloat("tTime", this.time);
    ubo.setTexture("splatSampler", this.splat);
  }

  getCustomCode(shaderType: string) {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef CDL_TERRAIN\nuniform sampler2D splatSampler;\n${TERRAIN_GLSL_FUNCS}\n#endif`,
      CUSTOM_FRAGMENT_MAIN_BEGIN: `vec3 tGlow = vec3(0.0);`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `#ifdef CDL_TERRAIN\n${TERRAIN_GLSL_MAIN}\n#endif`,
      CUSTOM_FRAGMENT_BEFORE_FOG: `#ifdef CDL_TERRAIN\ncolor.rgb += tGlow;\n#endif`,
    };
  }
}

/** Crée le matériau de sol pour une ambiance. */
export function makeTerrainMaterial(scene: Scene, biome: Biome, splat: Texture, waterLevel: number, size: number) {
  const mat = new StandardMaterial(`terrain-${biome.id}`, scene);
  mat.diffuseColor = Color3.White();
  mat.specularColor = new Color3(0.03, 0.03, 0.03);
  mat.specularPower = 12;
  mat.maxSimultaneousLights = 6;
  const plugin = new TerrainPlugin(mat, biome, splat, waterLevel, size);
  return { mat, plugin };
}

/** Texture RGBA « carte de mélange » à partir d'une fonction (x, z) → 4 poids 0-1. */
export function makeSplatTexture(
  scene: Scene, size: number, res: number,
  fn: (x: number, z: number) => [number, number, number, number],
): RawTexture {
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) {
    const z = ((j + 0.5) / res - 0.5) * size;
    for (let i = 0; i < res; i++) {
      const x = ((i + 0.5) / res - 0.5) * size;
      const w = fn(x, z);
      const o = (j * res + i) * 4;
      data[o] = Math.round(w[0] * 255);
      data[o + 1] = Math.round(w[1] * 255);
      data[o + 2] = Math.round(w[2] * 255);
      data[o + 3] = Math.round(w[3] * 255);
    }
  }
  const tex = RawTexture.CreateRGBATexture(data, res, res, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

// ---------------------------------------------------------------------------
// Vent dans les herbes
// ---------------------------------------------------------------------------

export class WindPlugin extends MaterialPluginBase {
  time = 0;

  constructor(material: Material, public strength: number) {
    super(material, "CendreluneWind", 210, { CDL_WIND: false });
    this._enable(true);
  }

  getClassName() {
    return "CendreluneWindPlugin";
  }

  isCompatible(lang: number) {
    return lang === 0;
  }

  prepareDefines(defines: any) {
    defines.CDL_WIND = true;
  }

  getUniforms() {
    return {
      ubo: [{ name: "wTime", size: 1, type: "float" }, { name: "wStrength", size: 1, type: "float" }],
      vertex: `#ifdef CDL_WIND\nuniform float wTime;\nuniform float wStrength;\n#endif`,
    };
  }

  bindForSubMesh(ubo: UniformBuffer) {
    ubo.updateFloat("wTime", this.time);
    ubo.updateFloat("wStrength", this.strength);
  }

  getCustomCode(shaderType: string) {
    if (shaderType !== "vertex") return null;
    return {
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `#ifdef CDL_WIND
  float wh = max(positionUpdated.y, 0.0);
  float gust = 0.6 + 0.4 * sin(wTime * 0.7 + worldPos.x * 0.05 + worldPos.z * 0.03);
  worldPos.x += sin(wTime * 1.9 + worldPos.x * 0.45 + worldPos.z * 0.2) * 0.13 * wh * wStrength * gust;
  worldPos.z += cos(wTime * 1.5 + worldPos.z * 0.4 - worldPos.x * 0.15) * 0.09 * wh * wStrength * gust;
#endif`,
    };
  }
}
