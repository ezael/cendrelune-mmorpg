/**
 * Zone extérieure : la Clairière de Cendrelune et son village.
 */
import {
  Color3, Color4, Effect, Mesh, MeshBuilder, ParticleSystem, PointLight, Scene, ShaderMaterial,
  StandardMaterial, TransformNode, Vector2, Vector3, VertexBuffer,
} from "@babylonjs/core";
import { fbm, rng, smoothstep } from "../../shared/noise.js";
import {
  LAKE, PATHS, VILLAGE, WATER_LEVEL, ZONES, getOutdoorObstacles, heightAt,
} from "../../shared/zones.js";
import { distToSegment } from "../../shared/noise.js";
import { Atmosphere } from "./atmosphere.js";
import { hex, scatter, softDotTexture, vertexColorMaterial } from "./kit.js";
import {
  makeCampfire, makeCaveArch, makeFence, makeFlower, makeGrassTuft, makeHouse, makeLanternPost,
  makeOak, makePine, makeRock, makeStump, makeWell,
} from "./props.js";
import type { ZoneWorld } from "./world.js";
import { LOW_QUALITY } from "../quality.js";

Effect.ShadersStore["waterVertexShader"] = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
varying vec3 vWorld;
void main() {
  vec4 w = world * vec4(position, 1.0);
  w.y += sin(w.x * 0.35 + time * 1.3) * 0.05 + cos(w.z * 0.42 + time * 1.1) * 0.05;
  vWorld = w.xyz;
  gl_Position = viewProjection * w;
}`;

Effect.ShadersStore["waterFragmentShader"] = `
precision highp float;
varying vec3 vWorld;
uniform vec3 cameraPosition;
uniform vec3 deep;
uniform vec3 shallow;
uniform vec3 sky;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float time;
uniform vec2 lakeCenter;
uniform float lakeRadius;

float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(v.y, 0.0), 3.0);
  float d = length(vWorld.xz - lakeCenter) / lakeRadius;
  vec3 col = mix(deep, shallow, smoothstep(0.35, 1.0, d));
  col = mix(col, sky, fres * 0.6);
  // Reflets scintillants
  float sp = n(vWorld.xz * 1.7 + vec2(time * 0.4, time * 0.25)) * n(vWorld.xz * 2.3 - vec2(time * 0.3, -time * 0.2));
  col += vec3(1.0) * smoothstep(0.55, 0.75, sp) * 0.35;
  // Écume sur la rive
  float foam = smoothstep(0.86, 1.0, d) * (0.5 + 0.5 * sin(time * 2.0 + d * 30.0));
  col = mix(col, vec3(0.92, 0.97, 1.0), foam * 0.45);
  float dist = length(cameraPosition - vWorld);
  float fog = 1.0 - exp(-pow(fogDensity * dist, 2.0));
  col = mix(col, fogColor, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 0.86);
}`;

const def = ZONES.clairiere;

export function buildOutdoor(scene: Scene): ZoneWorld {
  const atmo = new Atmosphere(scene);
  const root = new TransformNode("outdoor", scene);
  const r = rng(4242);
  const casters: Mesh[] = [];
  const disposables: Array<{ dispose(): void }> = [atmo];

  // ---------------------------------------------------------------------
  // Terrain
  // ---------------------------------------------------------------------
  const size = def.half * 2;
  const ground = MeshBuilder.CreateGround("terrain", { width: size, height: size, subdivisions: 120, updatable: true }, scene);
  const pos = ground.getVerticesData(VertexBuffer.PositionKind)!;
  for (let i = 0; i < pos.length; i += 3) pos[i + 1] = heightAt("clairiere", pos[i], pos[i + 2]);
  ground.updateVerticesData(VertexBuffer.PositionKind, pos);
  ground.convertToFlatShadedMesh();

  const fpos = ground.getVerticesData(VertexBuffer.PositionKind)!;
  const fnor = ground.getVerticesData(VertexBuffer.NormalKind)!;
  const colors = new Float32Array((fpos.length / 3) * 4);
  const grassA = hex("#6aa84f");
  const grassB = hex("#93c05a");
  const dry = hex("#b9b765");
  const dirt = hex("#b08a5a");
  const sand = hex("#d8c48a");
  const rock = hex("#8b8580");
  const snow = hex("#eef1f6");
  const lakebed = hex("#7b8a6a");
  const pathDist = (x: number, z: number) => {
    let best = Infinity;
    for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) best = Math.min(best, distToSegment(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
    return best;
  };
  for (let t = 0; t < fpos.length / 9; t++) {
    const o = t * 9;
    const cx = (fpos[o] + fpos[o + 3] + fpos[o + 6]) / 3;
    const cy = (fpos[o + 1] + fpos[o + 4] + fpos[o + 7]) / 3;
    const cz = (fpos[o + 2] + fpos[o + 5] + fpos[o + 8]) / 3;
    const ny = fnor[o + 1];
    const nz = fbm(cx * 0.08, cz * 0.08, 91, 2);
    let c = Color3.Lerp(grassA, grassB, nz);
    c = Color3.Lerp(c, dry, smoothstep(0.62, 0.8, fbm(cx * 0.02, cz * 0.02, 55, 2)) * 0.7);
    const pd = pathDist(cx, cz);
    c = Color3.Lerp(dirt, c, smoothstep(1.4, 3.2, pd + (nz - 0.5) * 1.5));
    const dv = Math.hypot(cx - VILLAGE.x, cz - VILLAGE.z);
    c = Color3.Lerp(Color3.Lerp(dirt, grassA, 0.35), c, smoothstep(4, 9, dv));
    if (cy < WATER_LEVEL + 0.45) c = Color3.Lerp(sand, c, smoothstep(WATER_LEVEL + 0.1, WATER_LEVEL + 0.45, cy));
    if (cy < WATER_LEVEL - 0.2) c = Color3.Lerp(lakebed, sand, smoothstep(WATER_LEVEL - 2, WATER_LEVEL - 0.2, cy));
    if (ny < 0.8) c = Color3.Lerp(c, rock, smoothstep(0.8, 0.6, ny));
    if (cy > 24) c = Color3.Lerp(c, snow, smoothstep(24, 28, cy) * (ny > 0.6 ? 1 : 0.4));
    const shade = 0.94 + r() * 0.08;
    for (let k = 0; k < 3; k++) {
      const vi = (t * 3 + k) * 4;
      colors[vi] = c.r * shade;
      colors[vi + 1] = c.g * shade;
      colors[vi + 2] = c.b * shade;
      colors[vi + 3] = 1;
    }
  }
  ground.setVerticesData(VertexBuffer.ColorKind, colors);
  ground.material = vertexColorMaterial(scene, "terrain");
  ground.receiveShadows = true;
  ground.checkCollisions = true;
  ground.isPickable = true;
  ground.metadata = { ground: true };
  ground.parent = root;
  ground.freezeWorldMatrix();

  // ---------------------------------------------------------------------
  // Lac
  // ---------------------------------------------------------------------
  const water = MeshBuilder.CreateGround("water", { width: LAKE.radius * 2.8, height: LAKE.radius * 2.8, subdivisions: 48 }, scene);
  water.position.set(LAKE.x, WATER_LEVEL, LAKE.z);
  const wmat = new ShaderMaterial("waterMat", scene, "water", {
    attributes: ["position"],
    uniforms: ["world", "viewProjection", "time", "cameraPosition", "deep", "shallow", "sky", "fogColor", "fogDensity", "lakeCenter", "lakeRadius"],
    needAlphaBlending: true,
  });
  wmat.setColor3("deep", hex("#1f5f86"));
  wmat.setColor3("shallow", hex("#3fa7b8"));
  wmat.setVector2("lakeCenter", new Vector2(LAKE.x, LAKE.z));
  wmat.setFloat("lakeRadius", LAKE.radius * 1.05);
  wmat.backFaceCulling = false;
  water.material = wmat;
  water.isPickable = false;
  water.parent = root;
  disposables.push(wmat);

  // ---------------------------------------------------------------------
  // Décor : arbres, rochers, maisons…
  // ---------------------------------------------------------------------
  const obstacles = getOutdoorObstacles();
  const groups = new Map<string, Array<{ x: number; y: number; z: number; rot: number; scale: number }>>();
  const add = (key: string, it: { x: number; y: number; z: number; rot: number; scale: number }) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  };
  const houses: Array<{ variant: number; x: number; y: number; z: number; rot: number }> = [];
  const lanterns: Vector3[] = [];
  let firePos = new Vector3(0, 0, 0);

  for (const o of obstacles) {
    const y = heightAt("clairiere", o.x, o.z);
    switch (o.kind) {
      case "pine": add(`pine${o.variant}`, { x: o.x, y: y - 0.1, z: o.z, rot: o.rot, scale: o.scale }); break;
      case "oak": add(`oak${o.variant}`, { x: o.x, y: y - 0.1, z: o.z, rot: o.rot, scale: o.scale }); break;
      case "rock": add(`rock${o.variant}`, { x: o.x, y: y - 0.2 * o.scale, z: o.z, rot: o.rot, scale: o.scale }); break;
      case "stump": add("stump", { x: o.x, y: y - 0.05, z: o.z, rot: o.rot, scale: 1 }); break;
      case "house": houses.push({ variant: o.variant, x: o.x, y, z: o.z, rot: o.rot }); break;
      case "well": add("well", { x: o.x, y, z: o.z, rot: o.rot, scale: 1 }); break;
      case "fire": firePos = new Vector3(o.x, y, o.z); add("campfire", { x: o.x, y, z: o.z, rot: 0, scale: 1 }); break;
      case "lantern": lanterns.push(new Vector3(o.x, y, o.z)); break;
    }
  }

  const factories: Record<string, () => Mesh> = {
    pine0: () => makePine(scene, 0), pine1: () => makePine(scene, 1), pine2: () => makePine(scene, 2),
    oak0: () => makeOak(scene, 0), oak1: () => makeOak(scene, 1), oak2: () => makeOak(scene, 2),
    rock0: () => makeRock(scene, 0), rock1: () => makeRock(scene, 1), rock2: () => makeRock(scene, 2),
    stump: () => makeStump(scene), well: () => makeWell(scene), campfire: () => makeCampfire(scene),
  };
  for (const [key, items] of groups) {
    const mesh = factories[key]();
    mesh.parent = root;
    scatter(mesh, items);
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    casters.push(mesh);
  }

  // Maisons : chaque variante est un modèle instancié.
  const windowMeshes: Mesh[] = [];
  for (let v = 0; v < 3; v++) {
    const list = houses.filter((h) => h.variant === v);
    if (!list.length) continue;
    const { body, windows } = makeHouse(scene, v);
    const items = list.map((h) => ({ x: h.x, y: h.y - 0.15, z: h.z, rot: h.rot, scale: 1 }));
    body.parent = root;
    windows.parent = root;
    scatter(body, items);
    scatter(windows, items);
    body.receiveShadows = true;
    body.isPickable = false;
    windows.isPickable = false;
    casters.push(body);
    windowMeshes.push(windows);
  }
  const windowMat = new StandardMaterial("windowMat", scene);
  windowMat.diffuseColor = hex("#5a4a30");
  windowMat.specularColor = Color3.Black();
  windowMeshes.forEach((w) => (w.material = windowMat));
  disposables.push(windowMat);

  // Clôtures autour du village (avec des ouvertures pour les chemins)
  const fences: Array<{ x: number; y: number; z: number; rot: number; scale: number }> = [];
  for (let a = 0; a < Math.PI * 2; a += 0.088) {
    const x = Math.cos(a) * 23;
    const z = Math.sin(a) * 23;
    let near = Infinity;
    for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) near = Math.min(near, distToSegment(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
    if (near < 3.5) continue;
    fences.push({ x, y: heightAt("clairiere", x, z) - 0.05, z, rot: -a, scale: 1 });
  }
  const fence = makeFence(scene);
  fence.parent = root;
  scatter(fence, fences);
  fence.isPickable = false;
  casters.push(fence);

  // Herbes et fleurs
  const tufts: Array<{ x: number; y: number; z: number; rot: number; scale: number }> = [];
  const flowers: Record<string, Array<{ x: number; y: number; z: number; rot: number; scale: number }>> = {
    "#fff6e0": [], "#ffd34d": [], "#ff7aa8": [], "#9fb8ff": [],
  };
  const flowerKeys = Object.keys(flowers);
  for (let i = 0; i < 16000 && tufts.length < (LOW_QUALITY ? 2500 : 7000); i++) {
    const x = (r() * 2 - 1) * (def.half - 14);
    const z = (r() * 2 - 1) * (def.half - 14);
    const y = heightAt("clairiere", x, z);
    if (y < WATER_LEVEL + 0.4 || y > 14) continue;
    if (Math.hypot(x, z) < 8) continue;
    const meadow = fbm(x * 0.05, z * 0.05, 33, 2);
    if (meadow < 0.42) continue;
    if (r() < 0.16) {
      flowers[flowerKeys[Math.floor(r() * flowerKeys.length)]].push({ x, y, z, rot: r() * 6, scale: 0.8 + r() * 0.6 });
    } else {
      tufts.push({ x, y: y - 0.05, z, rot: r() * 6, scale: 0.7 + r() * 0.8 });
    }
  }
  const grass = makeGrassTuft(scene);
  grass.parent = root;
  scatter(grass, tufts);
  grass.receiveShadows = true;
  grass.isPickable = false;
  for (const [col, items] of Object.entries(flowers)) {
    const f = makeFlower(scene, col);
    f.parent = root;
    scatter(f, items);
    f.isPickable = false;
  }

  // ---------------------------------------------------------------------
  // Feu de camp, lanternes, portail
  // ---------------------------------------------------------------------
  const dot = softDotTexture(scene, "dot");
  disposables.push(dot);

  const fireLight = new PointLight("fireLight", firePos.add(new Vector3(0, 1.2, 0)), scene);
  fireLight.diffuse = hex("#ff9a45");
  fireLight.specular = Color3.Black();
  fireLight.range = 20;
  disposables.push(fireLight);

  const fire = new ParticleSystem("fire", 600, scene);
  fire.particleTexture = dot;
  fire.emitter = firePos.add(new Vector3(0, 0.25, 0));
  fire.minEmitBox = new Vector3(-0.25, 0, -0.25);
  fire.maxEmitBox = new Vector3(0.25, 0, 0.25);
  fire.color1 = new Color4(1, 0.75, 0.25, 1);
  fire.color2 = new Color4(1, 0.4, 0.1, 1);
  fire.colorDead = new Color4(0.3, 0.05, 0, 0);
  fire.minSize = 0.25;
  fire.maxSize = 0.7;
  fire.minLifeTime = 0.35;
  fire.maxLifeTime = 0.8;
  fire.emitRate = 260;
  fire.blendMode = ParticleSystem.BLENDMODE_ADD;
  fire.gravity = new Vector3(0, 3.5, 0);
  fire.direction1 = new Vector3(-0.3, 1, -0.3);
  fire.direction2 = new Vector3(0.3, 1.6, 0.3);
  fire.minEmitPower = 0.4;
  fire.maxEmitPower = 1.0;
  fire.updateSpeed = 0.016;
  fire.start();
  disposables.push(fire);

  const sparks = new ParticleSystem("sparks", 120, scene);
  sparks.particleTexture = dot;
  sparks.emitter = firePos.add(new Vector3(0, 0.6, 0));
  sparks.color1 = new Color4(1, 0.8, 0.4, 1);
  sparks.color2 = new Color4(1, 0.5, 0.2, 1);
  sparks.colorDead = new Color4(1, 0.2, 0, 0);
  sparks.minSize = 0.04;
  sparks.maxSize = 0.09;
  sparks.minLifeTime = 1;
  sparks.maxLifeTime = 2.2;
  sparks.emitRate = 25;
  sparks.blendMode = ParticleSystem.BLENDMODE_ADD;
  sparks.gravity = new Vector3(0, 1.2, 0);
  sparks.direction1 = new Vector3(-0.6, 1, -0.6);
  sparks.direction2 = new Vector3(0.6, 2, 0.6);
  sparks.minEmitPower = 0.5;
  sparks.maxEmitPower = 1.5;
  sparks.start();
  disposables.push(sparks);

  const smoke = new ParticleSystem("smoke", 80, scene);
  smoke.particleTexture = dot;
  smoke.emitter = firePos.add(new Vector3(0, 1.3, 0));
  smoke.color1 = new Color4(0.5, 0.5, 0.5, 0.18);
  smoke.color2 = new Color4(0.4, 0.4, 0.42, 0.12);
  smoke.colorDead = new Color4(0.4, 0.4, 0.4, 0);
  smoke.minSize = 0.8;
  smoke.maxSize = 1.8;
  smoke.minLifeTime = 2.5;
  smoke.maxLifeTime = 4;
  smoke.emitRate = 10;
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  smoke.gravity = new Vector3(0.25, 0.6, 0);
  smoke.direction1 = new Vector3(-0.2, 1, -0.2);
  smoke.direction2 = new Vector3(0.2, 1, 0.2);
  smoke.minEmitPower = 0.3;
  smoke.maxEmitPower = 0.6;
  smoke.start();
  disposables.push(smoke);

  const { post, lamp } = makeLanternPost(scene);
  post.parent = root;
  lamp.parent = root;
  const lanternItems = lanterns.map((p) => ({ x: p.x, y: p.y, z: p.z, rot: Math.atan2(-p.x, -p.z) + Math.PI / 2, scale: 1 }));
  scatter(post, lanternItems);
  scatter(lamp, lanternItems);
  post.isPickable = lamp.isPickable = false;
  casters.push(post);
  const lampMat = new StandardMaterial("lampMat", scene);
  lampMat.diffuseColor = hex("#3a3020");
  lampMat.specularColor = Color3.Black();
  lamp.material = lampMat;
  disposables.push(lampMat);

  // Fumée de cheminée
  houses.forEach((h, i) => {
    if (i % 2) return;
    const cos = Math.cos(h.rot);
    const sin = Math.sin(h.rot);
    const lx = 3 - 1.2;
    const lz = -0.9;
    const ch = new ParticleSystem(`chimney${i}`, 40, scene);
    ch.particleTexture = dot;
    ch.emitter = new Vector3(h.x + lx * cos + lz * sin, h.y + 6.4, h.z - lx * sin + lz * cos);
    ch.color1 = new Color4(0.85, 0.85, 0.88, 0.12);
    ch.color2 = new Color4(0.7, 0.7, 0.75, 0.08);
    ch.colorDead = new Color4(0.7, 0.7, 0.7, 0);
    ch.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ch.minSize = 0.4;
    ch.maxSize = 1.0;
    ch.minLifeTime = 3;
    ch.maxLifeTime = 5;
    ch.emitRate = 4;
    ch.gravity = new Vector3(0.3, 0.4, 0.1);
    ch.direction1 = new Vector3(-0.1, 1, -0.1);
    ch.direction2 = new Vector3(0.1, 1, 0.1);
    ch.minEmitPower = 0.2;
    ch.maxEmitPower = 0.4;
    ch.start();
    disposables.push(ch);
  });

  // Lucioles près du lac et dans le village, la nuit.
  const fireflies = new ParticleSystem("fireflies", 260, scene);
  fireflies.particleTexture = dot;
  fireflies.emitter = new Vector3(LAKE.x * 0.5, 1.2, LAKE.z * 0.5);
  fireflies.minEmitBox = new Vector3(-40, 0, -35);
  fireflies.maxEmitBox = new Vector3(30, 2.5, 30);
  fireflies.color1 = new Color4(0.85, 1, 0.45, 1);
  fireflies.color2 = new Color4(1, 0.9, 0.4, 1);
  fireflies.colorDead = new Color4(0.6, 1, 0.3, 0);
  fireflies.minSize = 0.07;
  fireflies.maxSize = 0.14;
  fireflies.minLifeTime = 3;
  fireflies.maxLifeTime = 6;
  fireflies.emitRate = 0;
  fireflies.blendMode = ParticleSystem.BLENDMODE_ADD;
  fireflies.gravity = new Vector3(0, 0.05, 0);
  fireflies.direction1 = new Vector3(-0.3, -0.1, -0.3);
  fireflies.direction2 = new Vector3(0.3, 0.2, 0.3);
  fireflies.minEmitPower = 0.1;
  fireflies.maxEmitPower = 0.4;
  fireflies.start();
  disposables.push(fireflies);

  // Portail de la grotte
  const portal = def.portals[0];
  const portalY = heightAt("clairiere", portal.x, portal.z);
  const arch = makeCaveArch(scene);
  arch.position.set(portal.x, portalY - 0.2, portal.z);
  arch.rotation.y = Math.atan2(-(portal.x - 52), -(portal.z + 48));
  arch.parent = root;
  arch.receiveShadows = true;
  arch.isPickable = false;
  casters.push(arch);
  const veil = MeshBuilder.CreateDisc("veil", { radius: 2.0, tessellation: 32 }, scene);
  veil.position.set(portal.x, portalY + 2.2, portal.z);
  veil.rotation.y = arch.rotation.y + Math.PI;
  veil.scaling.y = 1.15;
  const veilMat = new StandardMaterial("veilMat", scene);
  veilMat.diffuseColor = Color3.Black();
  veilMat.specularColor = Color3.Black();
  veilMat.emissiveColor = hex("#7f55ff");
  veilMat.alpha = 0.55;
  veilMat.backFaceCulling = false;
  veil.material = veilMat;
  veil.isPickable = false;
  veil.parent = root;
  disposables.push(veilMat);
  const motes = new ParticleSystem("portalMotes", 200, scene);
  motes.particleTexture = dot;
  motes.emitter = new Vector3(portal.x, portalY + 2.2, portal.z);
  motes.createSphereEmitter(1.8, 0.3);
  motes.color1 = new Color4(0.7, 0.55, 1, 1);
  motes.color2 = new Color4(0.45, 0.8, 1, 1);
  motes.colorDead = new Color4(0.3, 0.2, 0.8, 0);
  motes.minSize = 0.06;
  motes.maxSize = 0.18;
  motes.minLifeTime = 0.8;
  motes.maxLifeTime = 1.8;
  motes.emitRate = 90;
  motes.blendMode = ParticleSystem.BLENDMODE_ADD;
  motes.minEmitPower = -0.6;
  motes.maxEmitPower = -0.2;
  motes.start();
  disposables.push(motes);
  const portalLight = new PointLight("portalLight", new Vector3(portal.x, portalY + 2.2, portal.z), scene);
  portalLight.diffuse = hex("#8f6bff");
  portalLight.specular = Color3.Black();
  portalLight.range = 12;
  portalLight.intensity = 1.2;
  disposables.push(portalLight);

  for (const m of casters) atmo.shadows.addShadowCaster(m, false);

  let time = 0;
  return {
    zoneId: "clairiere",
    atmosphere: atmo,
    shadows: atmo.shadows,
    ground,
    portalAnchors: [{ id: portal.id, position: new Vector3(portal.x, portalY + 5.6, portal.z), label: portal.label }],
    update(dt: number, timeOfDay: number) {
      time += dt;
      atmo.update(dt, timeOfDay);
      wmat.setFloat("time", time);
      wmat.setVector3("cameraPosition", scene.activeCamera!.globalPosition);
      wmat.setColor3("sky", scene.fogColor.scale(1.1));
      wmat.setColor3("fogColor", scene.fogColor);
      wmat.setFloat("fogDensity", scene.fogDensity);
      const flicker = 0.85 + Math.sin(time * 13) * 0.08 + Math.sin(time * 7.3) * 0.07 + (Math.random() - 0.5) * 0.08;
      fireLight.intensity = (1.6 + atmo.night * 1.4) * flicker;
      const glow = 0.15 + atmo.night * 0.95;
      windowMat.emissiveColor = hex("#ffc663").scale(glow);
      lampMat.emissiveColor = hex("#ffcf6b").scale(0.2 + atmo.night * 1.1);
      fireflies.emitRate = atmo.night * 60;
      veil.rotation.z += dt * 0.6;
      veilMat.alpha = 0.45 + Math.sin(time * 2) * 0.1;
      portalLight.intensity = 1.0 + Math.sin(time * 3) * 0.25;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
}
