/**
 * Zone intérieure : la Grotte des Échos (donjon).
 */
import {
  Color3, Color4, HemisphericLight, Mesh, MeshBuilder, ParticleSystem, PointLight, Scene,
  StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";
import { rng } from "../../shared/noise.js";
import { DUNGEON_CELL, DUNGEON_CRYSTALS, DUNGEON_MAP, ZONES, dungeonCellToWorld } from "../../shared/zones.js";
import { build, hex, jitter, paint, place, softDotTexture, vertexColorMaterial, wobble } from "./kit.js";
import { makeCaveArch } from "./props.js";
import type { ZoneWorld } from "./world.js";

const def = ZONES.grotte;
const SECTOR = 4; // cases par secteur d'éclairage

export function buildDungeon(scene: Scene): ZoneWorld {
  const root = new TransformNode("dungeon", scene);
  const r = rng(777);
  const disposables: Array<{ dispose(): void }> = [];
  scene.clearColor = new Color4(0.02, 0.02, 0.05, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.02;
  scene.fogColor = hex("#07070f");
  scene.ambientColor = hex("#101020");

  const hemi = new HemisphericLight("caveHemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.62;
  hemi.diffuse = hex("#8a92d8");
  hemi.groundColor = hex("#2c2440");
  hemi.specular = Color3.Black();
  disposables.push(hemi);

  const rows = DUNGEON_MAP.length;
  const cols = DUNGEON_MAP[0].length;
  const isFloor = (c: number, rr: number) => rr >= 0 && rr < rows && c >= 0 && c < cols && DUNGEON_MAP[rr][c] !== "#";

  const sectors = new Map<string, { floor: Mesh[]; wall: Mesh[]; cx: number; cz: number }>();
  const sectorOf = (c: number, rr: number) => {
    const key = `${Math.floor(c / SECTOR)}:${Math.floor(rr / SECTOR)}`;
    if (!sectors.has(key)) {
      const center = dungeonCellToWorld(Math.floor(c / SECTOR) * SECTOR + SECTOR / 2, Math.floor(rr / SECTOR) * SECTOR + SECTOR / 2);
      sectors.set(key, { floor: [], wall: [], cx: center.x, cz: center.z });
    }
    return sectors.get(key)!;
  };

  const torches: Array<{ pos: Vector3; normal: Vector3 }> = [];
  const floorCol = hex("#6a6474");
  const floorCol2 = hex("#585363");
  const wallCol = hex("#4e4659");

  for (let rr = 0; rr < rows; rr++) {
    for (let c = 0; c < cols; c++) {
      const { x, z } = dungeonCellToWorld(c, rr);
      const sec = sectorOf(c, rr);
      if (isFloor(c, rr)) {
        // Dalles irrégulières
        for (let i = 0; i < 4; i++) {
          const ox = (i % 2) - 0.5;
          const oz = Math.floor(i / 2) - 0.5;
          const tile = MeshBuilder.CreateBox("tile", { width: DUNGEON_CELL / 2 - 0.08, depth: DUNGEON_CELL / 2 - 0.08, height: 0.4 }, scene);
          place(tile, [x + ox * DUNGEON_CELL / 2, -0.2 + r() * 0.05, z + oz * DUNGEON_CELL / 2], [0, (r() - 0.5) * 0.06, 0]);
          paint(tile, jitter(r() < 0.5 ? floorCol : floorCol2, 0.1, r));
          sec.floor.push(tile);
        }
        // Gravats
        if (r() < 0.25) {
          const rub = MeshBuilder.CreateIcoSphere("rub", { radius: 0.25 + r() * 0.3, subdivisions: 1 }, scene);
          wobble(rub, 0.12, r);
          place(rub, [x + (r() - 0.5) * 3, 0.05, z + (r() - 0.5) * 3], [r(), r(), r()], [1, 0.6, 1]);
          paint(rub, jitter(hex("#55505e"), 0.1, r));
          sec.floor.push(rub);
        }
      } else {
        let touches = false;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (isFloor(c + dc, rr + dr)) touches = true;
        if (!touches) continue;
        const h = 5.5 + r() * 2.5;
        const wall = MeshBuilder.CreateBox("wall", { width: DUNGEON_CELL + 0.3, depth: DUNGEON_CELL + 0.3, height: h, updatable: true }, scene);
        wobble(wall, 0.6, r);
        place(wall, [x, h / 2 - 0.3, z], [0, (r() - 0.5) * 0.2, 0]);
        paint(wall, jitter(wallCol, 0.12, r));
        sec.wall.push(wall);
        // Rochers au pied des murs
        for (let i = 0; i < 2; i++) {
          const b = MeshBuilder.CreateIcoSphere("wb", { radius: 0.8 + r() * 0.7, subdivisions: 1 }, scene);
          wobble(b, 0.3, r);
          place(b, [x + (r() - 0.5) * 3.5, 0.2, z + (r() - 0.5) * 3.5], [r(), r(), r()], [1, 0.8, 1]);
          paint(b, jitter(hex("#463f4f"), 0.1, r));
          sec.wall.push(b);
        }
        // Torches sur les faces qui donnent sur le sol
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!isFloor(c + dc, rr + dr) || r() > 0.17 || torches.length >= 22) continue;
          const normal = new Vector3(dc, 0, -dr);
          const pos = new Vector3(x, 2.4, z).add(normal.scale(DUNGEON_CELL / 2 + 0.05));
          if (torches.some((t) => Vector3.Distance(t.pos, pos) < 7)) continue;
          torches.push({ pos, normal });
        }
      }
    }
  }

  const ground: Mesh[] = [];
  const chunkMeshes: Array<{ mesh: Mesh; cx: number; cz: number }> = [];
  for (const [key, sec] of sectors) {
    if (sec.floor.length) {
      const f = build(`floor${key}`, sec.floor, scene);
      f.material = vertexColorMaterial(scene, "cave");
      f.receiveShadows = true;
      f.checkCollisions = true;
      f.metadata = { ground: true };
      f.parent = root;
      f.freezeWorldMatrix();
      ground.push(f);
      chunkMeshes.push({ mesh: f, cx: sec.cx, cz: sec.cz });
    }
    if (sec.wall.length) {
      const w = build(`walls${key}`, sec.wall, scene);
      w.material = vertexColorMaterial(scene, "cave");
      w.checkCollisions = true;
      w.isPickable = false;
      w.parent = root;
      w.freezeWorldMatrix();
      chunkMeshes.push({ mesh: w, cx: sec.cx, cz: sec.cz });
    }
  }
  const caveMat = vertexColorMaterial(scene, "cave");
  caveMat.maxSimultaneousLights = 8;

  // Torches : support, flamme et lumière qui n'éclaire que les secteurs proches.
  const dot = softDotTexture(scene, "caveDot");
  disposables.push(dot);
  const holders: Mesh[] = [];
  const torchLights: PointLight[] = [];
  torches.forEach((t, i) => {
    const yaw = Math.atan2(t.normal.x, t.normal.z);
    holders.push(paint(place(MeshBuilder.CreateCylinder("th", { height: 0.7, diameterTop: 0.16, diameterBottom: 0.08, tessellation: 6 }, scene), [t.pos.x, t.pos.y - 0.1, t.pos.z], [0.45 * Math.cos(yaw), 0, -0.45 * Math.sin(yaw)]), hex("#4a3322")));
    holders.push(paint(place(MeshBuilder.CreateBox("tb", { width: 0.3, height: 0.12, depth: 0.3 }, scene), [t.pos.x - t.normal.x * 0.1, t.pos.y - 0.35, t.pos.z - t.normal.z * 0.1]), hex("#2c2a2e")));
    const flamePos = t.pos.add(t.normal.scale(0.18)).add(new Vector3(0, 0.35, 0));
    const ps = new ParticleSystem(`torch${i}`, 70, scene);
    ps.particleTexture = dot;
    ps.emitter = flamePos;
    ps.minEmitBox = new Vector3(-0.06, 0, -0.06);
    ps.maxEmitBox = new Vector3(0.06, 0, 0.06);
    ps.color1 = new Color4(1, 0.7, 0.25, 1);
    ps.color2 = new Color4(1, 0.4, 0.1, 1);
    ps.colorDead = new Color4(0.3, 0.05, 0, 0);
    ps.minSize = 0.12;
    ps.maxSize = 0.3;
    ps.minLifeTime = 0.2;
    ps.maxLifeTime = 0.5;
    ps.emitRate = 70;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, 2.5, 0);
    ps.direction1 = new Vector3(-0.1, 1, -0.1);
    ps.direction2 = new Vector3(0.1, 1.4, 0.1);
    ps.minEmitPower = 0.2;
    ps.maxEmitPower = 0.5;
    ps.start();
    disposables.push(ps);
    const light = new PointLight(`torchLight${i}`, flamePos.add(t.normal.scale(0.5)), scene);
    light.diffuse = hex("#ff9a4a");
    light.specular = Color3.Black();
    light.range = 13;
    light.intensity = 1.4;
    light.includedOnlyMeshes = chunkMeshes
      .filter((cm) => Math.hypot(cm.cx - flamePos.x, cm.cz - flamePos.z) < 20)
      .map((cm) => cm.mesh);
    torchLights.push(light);
    disposables.push(light);
  });
  if (holders.length) {
    const h = build("torchHolders", holders, scene);
    h.parent = root;
    h.isPickable = false;
  }

  // Cristaux lumineux
  const crystalParts: Mesh[] = [];
  const crystalLights: PointLight[] = [];
  const crystalSpots = [...DUNGEON_CRYSTALS];
  const boss = def.mobs.find((m) => m.kind === "gardien");
  if (boss) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      crystalSpots.push({ x: boss.x + Math.cos(a) * 7, z: boss.z + Math.sin(a) * 6 });
    }
  }
  crystalSpots.forEach((p, i) => {
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const cr = MeshBuilder.CreatePolyhedron("cr", { type: 1, size: 0.35 }, scene);
      const h = 1.6 + r() * 2.2;
      place(cr, [p.x + (r() - 0.5) * 1.4, h * 0.3, p.z + (r() - 0.5) * 1.4], [(r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7], [0.7, h, 0.7]);
      paint(cr, Color3.Lerp(hex("#b8f0ff"), hex("#d8c0ff"), r()));
      crystalParts.push(cr);
    }
    if (i % 2 === 0 && crystalLights.length < 8) {
      const l = new PointLight(`crystalLight${i}`, new Vector3(p.x, 1.6, p.z), scene);
      l.diffuse = i % 4 === 0 ? hex("#7fb8ff") : hex("#b48cff");
      l.specular = Color3.Black();
      l.range = 11;
      l.intensity = 1.1;
      l.includedOnlyMeshes = chunkMeshes.filter((cm) => Math.hypot(cm.cx - p.x, cm.cz - p.z) < 18).map((cm) => cm.mesh);
      crystalLights.push(l);
      disposables.push(l);
    }
  });
  const crystals = build("crystals", crystalParts, scene);
  const crystalMat = new StandardMaterial("crystalMat", scene);
  crystalMat.diffuseColor = Color3.White();
  crystalMat.emissiveColor = hex("#3a4f90");
  crystalMat.specularColor = new Color3(0.8, 0.8, 1);
  crystalMat.specularPower = 64;
  crystalMat.alpha = 0.92;
  crystals.material = crystalMat;
  crystals.parent = root;
  crystals.isPickable = false;
  disposables.push(crystalMat);

  // Cercle runique dans la salle du Gardien
  if (boss) {
    const ring = MeshBuilder.CreateTorus("runeRing", { diameter: 9, thickness: 0.18, tessellation: 64 }, scene);
    ring.position.set(boss.x, 0.03, boss.z);
    ring.scaling.y = 0.1;
    const ringMat = new StandardMaterial("ringMat", scene);
    ringMat.emissiveColor = hex("#a070ff");
    ringMat.diffuseColor = Color3.Black();
    ring.material = ringMat;
    ring.isPickable = false;
    ring.parent = root;
    disposables.push(ringMat);
  }

  // Portail de sortie
  const portal = def.portals[0];
  const arch = makeCaveArch(scene);
  arch.position.set(portal.x - 1.6, 0, portal.z);
  arch.rotation.y = Math.PI / 2;
  arch.parent = root;
  arch.isPickable = false;
  const veil = MeshBuilder.CreateDisc("veil", { radius: 1.9, tessellation: 32 }, scene);
  veil.position.set(portal.x - 1.6, 2.2, portal.z);
  veil.rotation.y = Math.PI / 2;
  veil.scaling.y = 1.15;
  const veilMat = new StandardMaterial("veilMatCave", scene);
  veilMat.emissiveColor = hex("#9fd8ff");
  veilMat.diffuseColor = Color3.Black();
  veilMat.alpha = 0.55;
  veilMat.backFaceCulling = false;
  veil.material = veilMat;
  veil.isPickable = false;
  veil.parent = root;
  disposables.push(veilMat);

  // Poussière en suspension
  const dust = new ParticleSystem("dust", 500, scene);
  dust.particleTexture = dot;
  dust.emitter = new Vector3(0, 2, 0);
  dust.minEmitBox = new Vector3(-cols * 2, -1.5, -rows * 2);
  dust.maxEmitBox = new Vector3(cols * 2, 3, rows * 2);
  dust.color1 = new Color4(0.6, 0.7, 1, 0.35);
  dust.color2 = new Color4(0.8, 0.7, 1, 0.25);
  dust.colorDead = new Color4(0.5, 0.5, 0.8, 0);
  dust.minSize = 0.03;
  dust.maxSize = 0.08;
  dust.minLifeTime = 4;
  dust.maxLifeTime = 8;
  dust.emitRate = 70;
  dust.blendMode = ParticleSystem.BLENDMODE_ADD;
  dust.direction1 = new Vector3(-0.1, -0.05, -0.1);
  dust.direction2 = new Vector3(0.1, 0.1, 0.1);
  dust.minEmitPower = 0.05;
  dust.maxEmitPower = 0.2;
  dust.start();
  disposables.push(dust);

  // Le sol unique attendu par le reste du jeu (le premier secteur suffit pour l'API).
  const groundMesh = ground[0];
  let time = 0;
  return {
    zoneId: "grotte",
    shadows: null,
    ground: groundMesh,
    portalAnchors: [{ id: portal.id, position: new Vector3(portal.x - 1.6, 5.2, portal.z), label: portal.label }],
    update(dt: number) {
      time += dt;
      torchLights.forEach((l, i) => {
        l.intensity = 1.35 + Math.sin(time * 11 + i * 1.7) * 0.12 + Math.sin(time * 5.3 + i) * 0.1 + (Math.random() - 0.5) * 0.08;
      });
      crystalLights.forEach((l, i) => (l.intensity = 1.0 + Math.sin(time * 1.5 + i) * 0.25));
      crystalMat.emissiveColor = Color3.Lerp(hex("#2f4c9a"), hex("#5a3fa8"), 0.5 + Math.sin(time * 0.8) * 0.5);
      veil.rotation.z += dt * 0.6;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      root.dispose(false, true);
    },
  };
}
