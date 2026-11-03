/**
 * Modèles 3D du décor, générés en code (arbres, rochers, maisons, feu de camp…).
 */
import { Color3, Mesh, MeshBuilder, Scene } from "@babylonjs/core";
import { rng } from "../../shared/noise.js";
import { build, hex, jitter, paint, place, wobble } from "./kit.js";

const FOLIAGE = [
  ["#3f7d3a", "#4e9445", "#5fa850"],
  ["#2f6b46", "#3c7f52", "#4a935e"],
  ["#5a8f34", "#6fa83e", "#86bd4a"],
];
const OAK_LEAVES = [
  ["#6aa83f", "#7dbd48", "#93cf56"],
  ["#d08a2e", "#e2a23a", "#efbd52"], // un chêne d'automne pour la couleur
  ["#4f9a4a", "#62ad55", "#77c262"],
];

export function makePine(scene: Scene, variant: number): Mesh {
  const r = rng(100 + variant);
  const parts: Mesh[] = [];
  parts.push(paint(place(MeshBuilder.CreateCylinder("t", { height: 1.6, diameterTop: 0.22, diameterBottom: 0.38, tessellation: 6 }, scene), [0, 0.8, 0]), hex("#6b4a2f")));
  const cols = FOLIAGE[variant % FOLIAGE.length];
  const layers = [
    { y: 1.6, h: 2.0, d: 2.9 },
    { y: 2.7, h: 1.8, d: 2.3 },
    { y: 3.7, h: 1.6, d: 1.6 },
  ];
  layers.forEach((l, i) => {
    const cone = MeshBuilder.CreateCylinder("c", { height: l.h, diameterTop: 0, diameterBottom: l.d, tessellation: 7 }, scene);
    wobble(cone, 0.18, r);
    place(cone, [0, l.y + l.h / 2 - 0.3, 0], [0, r() * 3, 0]);
    paint(cone, jitter(hex(cols[i]), 0.05, r));
    parts.push(cone);
  });
  return build(`pine${variant}`, parts, scene);
}

export function makeOak(scene: Scene, variant: number): Mesh {
  const r = rng(200 + variant);
  const parts: Mesh[] = [];
  parts.push(paint(place(MeshBuilder.CreateCylinder("t", { height: 2.0, diameterTop: 0.3, diameterBottom: 0.5, tessellation: 6 }, scene), [0, 1.0, 0]), hex("#76522f")));
  parts.push(paint(place(MeshBuilder.CreateCylinder("b", { height: 1.0, diameterTop: 0.1, diameterBottom: 0.2, tessellation: 5 }, scene), [0.35, 2.0, 0], [0, 0, -0.7]), hex("#76522f")));
  const cols = OAK_LEAVES[variant % OAK_LEAVES.length];
  const blobs: Array<[number, number, number, number]> = [
    [0, 2.9, 0, 1.55], [0.75, 2.5, 0.3, 1.05], [-0.7, 2.55, -0.2, 1.1], [0.1, 2.45, -0.75, 1.0], [-0.2, 3.5, 0.2, 0.9],
  ];
  blobs.forEach(([x, y, z, s], i) => {
    const b = MeshBuilder.CreateIcoSphere("l", { radius: 1, subdivisions: 1 }, scene);
    wobble(b, 0.25, r);
    place(b, [x, y, z], [r(), r(), r()], [s, s * 0.85, s]);
    paint(b, jitter(hex(cols[i % 3]), 0.05, r));
    parts.push(b);
  });
  return build(`oak${variant}`, parts, scene);
}

export function makeRock(scene: Scene, variant: number): Mesh {
  const r = rng(300 + variant);
  const parts: Mesh[] = [];
  const base = ["#8d8a86", "#7f8790", "#9a9283"][variant % 3];
  const main = MeshBuilder.CreateIcoSphere("r", { radius: 0.8, subdivisions: 1 }, scene);
  wobble(main, 0.35, r);
  place(main, [0, 0.35, 0], [0, 0, 0], [1.2, 0.75, 1]);
  paint(main, hex(base));
  parts.push(main);
  const small = MeshBuilder.CreateIcoSphere("r2", { radius: 0.4, subdivisions: 1 }, scene);
  wobble(small, 0.2, r);
  place(small, [0.75, 0.15, 0.35], [0, 0, 0], [1, 0.7, 1]);
  paint(small, jitter(hex(base), 0.08, r));
  parts.push(small);
  // Un peu de mousse sur le dessus
  const moss = MeshBuilder.CreateIcoSphere("m", { radius: 0.55, subdivisions: 1 }, scene);
  wobble(moss, 0.2, r);
  place(moss, [-0.1, 0.72, -0.05], [0, 0, 0], [1.1, 0.25, 0.9]);
  paint(moss, hex("#6f9a45"));
  parts.push(moss);
  return build(`rock${variant}`, parts, scene);
}

export function makeStump(scene: Scene): Mesh {
  const parts = [
    paint(place(MeshBuilder.CreateCylinder("s", { height: 0.5, diameterTop: 0.6, diameterBottom: 0.75, tessellation: 7 }, scene), [0, 0.25, 0]), hex("#6b4a2f")),
    paint(place(MeshBuilder.CreateCylinder("s2", { height: 0.02, diameter: 0.55, tessellation: 7 }, scene), [0, 0.51, 0]), hex("#c9a46a")),
  ];
  return build("stump", parts, scene);
}

/** Maison à colombages. Renvoie le corps et les fenêtres (lumineuses la nuit) séparément. */
export function makeHouse(scene: Scene, variant: number): { body: Mesh; windows: Mesh } {
  const roofCol = ["#a5442f", "#4c6a8f", "#6a7f3a"][variant % 3];
  const wallCol = ["#efe3c8", "#e8dcc4", "#f3e8d0"][variant % 3];
  const timber = hex("#5b3a23");
  const parts: Mesh[] = [];
  const W = 6, D = 5, H = 3.2;
  // Soubassement en pierre
  parts.push(paint(place(MeshBuilder.CreateBox("base", { width: W + 0.3, depth: D + 0.3, height: 0.5 }, scene), [0, 0.25, 0]), hex("#8a8580")));
  parts.push(paint(place(MeshBuilder.CreateBox("walls", { width: W, depth: D, height: H }, scene), [0, 0.5 + H / 2, 0]), hex(wallCol)));
  // Colombages
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(paint(place(MeshBuilder.CreateBox("p", { width: 0.25, depth: 0.25, height: H }, scene), [sx * W / 2, 0.5 + H / 2, sz * D / 2]), timber));
  }
  for (const sz of [-1, 1]) {
    parts.push(paint(place(MeshBuilder.CreateBox("h", { width: W + 0.05, depth: 0.2, height: 0.2 }, scene), [0, 0.5 + H, sz * (D / 2 + 0.03)]), timber));
    parts.push(paint(place(MeshBuilder.CreateBox("h2", { width: W + 0.05, depth: 0.2, height: 0.16 }, scene), [0, 0.5 + H * 0.55, sz * (D / 2 + 0.03)]), timber));
    for (const x of [-1.5, 1.5]) {
      parts.push(paint(place(MeshBuilder.CreateBox("x", { width: 0.16, depth: 0.16, height: 2.0 }, scene), [x, 0.5 + H * 0.78, sz * (D / 2 + 0.04)], [0, 0, x > 0 ? 0.6 : -0.6]), timber));
    }
  }
  // Toit à deux pans (prisme triangulaire)
  const roof = MeshBuilder.CreateCylinder("roof", { height: W + 1.0, diameter: 6.7, tessellation: 3 }, scene);
  place(roof, [0, 0.5 + H + 0.64, 0], [0, 0, Math.PI / 2], [0.44, 1, 1]);
  paint(roof, hex(roofCol));
  parts.push(roof);
  // Pignons
  for (const sx of [-1, 1]) {
    const gable = MeshBuilder.CreateCylinder("gable", { height: 0.1, diameter: 5.6, tessellation: 3 }, scene);
    place(gable, [sx * (W / 2 - 0.02), 0.5 + H + 0.66, 0], [0, 0, Math.PI / 2], [0.476, 1, 1]);
    paint(gable, hex(wallCol));
    parts.push(gable);
  }
  // Cheminée
  parts.push(paint(place(MeshBuilder.CreateBox("ch", { width: 0.7, depth: 0.7, height: 2.2 }, scene), [W / 2 - 1.2, 0.5 + H + 1.6, -0.9]), hex("#857a70")));
  // Porte
  parts.push(paint(place(MeshBuilder.CreateBox("door", { width: 1.1, depth: 0.12, height: 1.9 }, scene), [0, 0.5 + 0.95, D / 2 + 0.04]), hex("#6d4527")));
  parts.push(paint(place(MeshBuilder.CreateBox("step", { width: 1.6, depth: 0.7, height: 0.2 }, scene), [0, 0.1, D / 2 + 0.45]), hex("#8a8580")));
  const body = build(`house${variant}`, parts, scene);

  const wins: Mesh[] = [];
  for (const x of [-1.9, 1.9]) {
    wins.push(paint(place(MeshBuilder.CreateBox("w", { width: 0.8, depth: 0.08, height: 0.8 }, scene), [x, 0.5 + 1.7, D / 2 + 0.05]), hex("#ffd27a")));
  }
  for (const sx of [-1, 1]) {
    wins.push(paint(place(MeshBuilder.CreateBox("w2", { width: 0.08, depth: 0.8, height: 0.8 }, scene), [sx * (W / 2 + 0.05), 0.5 + 1.7, 0]), hex("#ffd27a")));
  }
  const windows = build(`windows${variant}`, wins, scene, false);
  return { body, windows };
}

export function makeWell(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  parts.push(paint(place(MeshBuilder.CreateCylinder("w", { height: 0.9, diameter: 1.9, tessellation: 10 }, scene), [0, 0.45, 0]), hex("#8d8a86")));
  parts.push(paint(place(MeshBuilder.CreateCylinder("water", { height: 0.05, diameter: 1.5, tessellation: 10 }, scene), [0, 0.75, 0]), hex("#3b6f8f")));
  for (const sx of [-1, 1]) {
    parts.push(paint(place(MeshBuilder.CreateBox("p", { width: 0.15, depth: 0.15, height: 1.9 }, scene), [sx * 0.85, 1.4, 0]), hex("#6b4a2f")));
  }
  const roof = MeshBuilder.CreateCylinder("r", { height: 2.3, diameter: 1.9, tessellation: 3 }, scene);
  place(roof, [0, 2.6, 0], [0, 0, Math.PI / 2], [0.6, 1, 1]);
  paint(roof, hex("#a5442f"));
  parts.push(roof);
  parts.push(paint(place(MeshBuilder.CreateCylinder("axe", { height: 1.7, diameter: 0.12, tessellation: 6 }, scene), [0, 1.85, 0], [0, 0, Math.PI / 2]), hex("#5b3a23")));
  return build("well", parts, scene);
}

export function makeCampfire(scene: Scene): Mesh {
  const r = rng(77);
  const parts: Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = MeshBuilder.CreateIcoSphere("s", { radius: 0.22, subdivisions: 1 }, scene);
    wobble(s, 0.1, r);
    place(s, [Math.cos(a) * 0.85, 0.12, Math.sin(a) * 0.85], [0, 0, 0], [1, 0.7, 1]);
    paint(s, jitter(hex("#7d7873"), 0.1, r));
    parts.push(s);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    parts.push(paint(place(MeshBuilder.CreateCylinder("log", { height: 1.2, diameter: 0.16, tessellation: 6 }, scene), [Math.cos(a) * 0.25, 0.25, Math.sin(a) * 0.25], [0, -a, 1.1]), hex("#5b3a23")));
  }
  parts.push(paint(place(MeshBuilder.CreateCylinder("ash", { height: 0.04, diameter: 1.3, tessellation: 9 }, scene), [0, 0.02, 0]), hex("#3a3330")));
  return build("campfire", parts, scene);
}

export function makeLanternPost(scene: Scene): { post: Mesh; lamp: Mesh } {
  const post = build("lanternPost", [
    paint(place(MeshBuilder.CreateCylinder("p", { height: 2.6, diameter: 0.14, tessellation: 6 }, scene), [0, 1.3, 0]), hex("#3c2c22")),
    paint(place(MeshBuilder.CreateBox("arm", { width: 0.7, height: 0.08, depth: 0.08 }, scene), [0.3, 2.5, 0]), hex("#3c2c22")),
    paint(place(MeshBuilder.CreateCylinder("cap", { height: 0.18, diameterTop: 0.05, diameterBottom: 0.42, tessellation: 4 }, scene), [0.6, 2.42, 0], [0, Math.PI / 4, 0]), hex("#2b2622")),
  ], scene);
  const lamp = build("lanternLamp", [
    paint(place(MeshBuilder.CreateBox("l", { width: 0.26, height: 0.34, depth: 0.26 }, scene), [0.6, 2.2, 0]), hex("#ffcf6b")),
  ], scene, false);
  return { post, lamp };
}

/** Arche de pierre à l'entrée de la grotte. */
export function makeCaveArch(scene: Scene): Mesh {
  const r = rng(909);
  const parts: Mesh[] = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const b = MeshBuilder.CreateIcoSphere("b", { radius: 1, subdivisions: 1 }, scene);
      wobble(b, 0.35, r);
      place(b, [sx * 2.6, 0.9 + i * 1.5, 0], [r(), r(), r()], [1.1, 1.0, 1.2]);
      paint(b, jitter(hex("#6f6a66"), 0.08, r));
      parts.push(b);
    }
  }
  const top = MeshBuilder.CreateIcoSphere("t", { radius: 1, subdivisions: 1 }, scene);
  wobble(top, 0.3, r);
  place(top, [0, 4.6, 0], [0.2, 0.4, 0.1], [3.6, 1.1, 1.4]);
  paint(top, hex("#77716c"));
  parts.push(top);
  // Runes
  for (const sx of [-1, 1]) {
    parts.push(paint(place(MeshBuilder.CreateBox("rune", { width: 0.12, height: 0.9, depth: 0.1 }, scene), [sx * 1.75, 2.4, 0.95]), hex("#9d7bff")));
  }
  return build("caveArch", parts, scene);
}

export function makeGrassTuft(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const blade = MeshBuilder.CreateCylinder("g", { height: 0.5, diameterTop: 0, diameterBottom: 0.09, tessellation: 3 }, scene);
    place(blade, [Math.cos(a) * 0.08, 0.22, Math.sin(a) * 0.08], [Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35]);
    paint(blade, Color3.Lerp(hex("#5c9a3c"), hex("#9ccc5a"), i / 4));
    parts.push(blade);
  }
  return build("grass", parts, scene);
}

export function makeFlower(scene: Scene, color: string): Mesh {
  return build(`flower${color}`, [
    paint(place(MeshBuilder.CreateCylinder("st", { height: 0.35, diameter: 0.03, tessellation: 3 }, scene), [0, 0.17, 0]), hex("#4f8a35")),
    paint(place(MeshBuilder.CreateIcoSphere("f", { radius: 0.08, subdivisions: 1 }, scene), [0, 0.37, 0], [0, 0, 0], [1, 0.6, 1]), hex(color)),
  ], scene);
}

export function makeFence(scene: Scene): Mesh {
  const wood = hex("#7a5534");
  return build("fence", [
    paint(place(MeshBuilder.CreateBox("p1", { width: 0.12, height: 1.0, depth: 0.12 }, scene), [-1, 0.5, 0]), wood),
    paint(place(MeshBuilder.CreateBox("p2", { width: 0.12, height: 1.0, depth: 0.12 }, scene), [1, 0.5, 0]), wood),
    paint(place(MeshBuilder.CreateBox("r1", { width: 2.1, height: 0.1, depth: 0.06 }, scene), [0, 0.75, 0]), wood),
    paint(place(MeshBuilder.CreateBox("r2", { width: 2.1, height: 0.1, depth: 0.06 }, scene), [0, 0.4, 0]), wood),
  ], scene);
}
