/**
 * Définition des zones. Tout est déterministe : le client construit le décor et le
 * serveur valide les déplacements à partir des mêmes données.
 */
import { clamp, distToSegment, fbm, lerp, rng, smoothstep } from "./noise.js";
import type { MobKindId } from "./rules.js";

export type ZoneId = "clairiere" | "grotte";

export interface Portal {
  id: string;
  x: number;
  z: number;
  radius: number;
  to: ZoneId;
  /** Point d'arrivée dans la zone de destination. */
  arrival: { x: number; z: number };
  label: string;
}

export interface MobSpawn {
  kind: MobKindId;
  x: number;
  z: number;
  wander: number;
}

export interface Obstacle {
  x: number;
  z: number;
  r: number;
  kind: "pine" | "oak" | "rock" | "house" | "well" | "fire" | "lantern" | "stump";
  scale: number;
  rot: number;
  variant: number;
}

export interface ZoneDef {
  id: ZoneId;
  name: string;
  subtitle: string;
  kind: "outdoor" | "dungeon";
  half: number;
  spawn: { x: number; z: number };
  portals: Portal[];
  mobs: MobSpawn[];
  /** Ambiance visuelle par défaut (voir src/client/world/biomes.ts). */
  ambiance?: string;
}

// ---------------------------------------------------------------------------
// Clairière de Cendrelune (extérieur + village)
// ---------------------------------------------------------------------------

export const WATER_LEVEL = -0.35;
const OUT_SEED = 1337;
const OUT_HALF = 110;
export const VILLAGE = { x: 0, z: 0, radius: 22 };
export const LAKE = { x: -48, z: 38, radius: 24 };
const CAVE_PORTAL = { x: 66, z: -62 };

/** Chemins de terre (polylignes) qui partent du village. */
export const PATHS: Array<Array<[number, number]>> = [
  [[0, 0], [18, -14], [36, -30], [52, -48], [CAVE_PORTAL.x - 4, CAVE_PORTAL.z + 5]],
  [[0, 0], [-16, 12], [-26, 22]],
  [[0, 0], [14, 20], [22, 46], [18, 80]],
  [[0, 0], [-22, -18], [-50, -30], [-80, -26]],
];

function pathDistance(x: number, z: number): number {
  let best = Infinity;
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i];
      const [bx, bz] = path[i + 1];
      best = Math.min(best, distToSegment(x, z, ax, az, bx, bz));
    }
  }
  return best;
}

function outdoorHeight(x: number, z: number): number {
  // Collines douces
  let h = (fbm(x * 0.016 + 10, z * 0.016 - 4, OUT_SEED, 5) - 0.45) * 13;
  // Montagnes en bordure : une cuvette naturelle qui délimite la zone
  const edge = Math.max(Math.abs(x), Math.abs(z)) / OUT_HALF;
  h += smoothstep(0.72, 1.0, edge) * (22 + fbm(x * 0.05, z * 0.05, OUT_SEED + 9, 3) * 14);
  // Falaise derrière l'entrée de la grotte
  const dc = Math.hypot(x - (CAVE_PORTAL.x + 8), z - (CAVE_PORTAL.z - 8));
  h += (1 - smoothstep(6, 26, dc)) * 14;
  // Village plat
  const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  h = lerp(0.35, h, smoothstep(VILLAGE.radius - 4, VILLAGE.radius + 10, dv));
  // Lac
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  h = lerp(-3.2, h, smoothstep(LAKE.radius * 0.45, LAKE.radius * 1.15, dl));
  // Chemins aplanis
  const dp = pathDistance(x, z);
  h = lerp(h * 0.55 + 0.25, h, smoothstep(1.5, 6, dp));
  // Parvis de la grotte
  const dpo = Math.hypot(x - CAVE_PORTAL.x, z - CAVE_PORTAL.z);
  h = lerp(1.2, h, smoothstep(5, 10, dpo));
  return h;
}

/** Densité de la forêt (0-1) : sert au placement des arbres et à l'ombre des sous-bois. */
export function forestDensity(x: number, z: number): number {
  return fbm(x * 0.03, z * 0.03, OUT_SEED + 5, 3);
}

/** Distance au chemin de terre le plus proche. */
export { pathDistance };

let outdoorObstacles: Obstacle[] | null = null;

/** Arbres, rochers, maisons… générés une fois de façon déterministe. */
export function getOutdoorObstacles(): Obstacle[] {
  if (outdoorObstacles) return outdoorObstacles;
  const list: Obstacle[] = [];
  const r = rng(OUT_SEED + 1);

  // Village : maisons en cercle, orientées vers la place, en laissant passer les chemins.
  const houseAngles = [0.35, 1.25, 2.0, 2.75, 3.55, 4.35, 5.1, 5.85];
  houseAngles.forEach((a, i) => {
    const rad = 15.5;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    if (pathDistance(x, z) < 5) return;
    list.push({ x, z, r: 3.4, kind: "house", scale: 1, rot: -a + Math.PI / 2, variant: i % 3 });
  });
  list.push({ x: 0, z: 0, r: 1.1, kind: "fire", scale: 1, rot: 0, variant: 0 });
  list.push({ x: -6, z: 5, r: 1.2, kind: "well", scale: 1, rot: 0.4, variant: 0 });
  // Lanternes le long des chemins, près du village
  for (const path of PATHS) {
    const [ax, az] = path[0];
    const [bx, bz] = path[1];
    for (const t of [0.55, 0.95]) {
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      const nx = -(bz - az);
      const nz = bx - ax;
      const nl = Math.hypot(nx, nz) || 1;
      list.push({ x: px + (nx / nl) * 2.6, z: pz + (nz / nl) * 2.6, r: 0.25, kind: "lantern", scale: 1, rot: 0, variant: 0 });
    }
  }

  // Forêt
  for (let i = 0; i < 1400 && list.length < 520; i++) {
    const x = (r() * 2 - 1) * (OUT_HALF - 4);
    const z = (r() * 2 - 1) * (OUT_HALF - 4);
    const density = forestDensity(x, z);
    if (density < 0.47) continue;
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.radius + 6) continue;
    if (pathDistance(x, z) < 4.5) continue;
    if (Math.hypot(x - CAVE_PORTAL.x, z - CAVE_PORTAL.z) < 12) continue;
    const h = outdoorHeight(x, z);
    if (h < WATER_LEVEL + 0.6) continue;
    if (list.some((o) => Math.hypot(o.x - x, o.z - z) < 3.2)) continue;
    const pine = h > 3 || r() < 0.55;
    const scale = 0.8 + r() * 0.7;
    list.push({
      x, z, r: 0.6 * scale, kind: pine ? "pine" : "oak", scale,
      rot: r() * Math.PI * 2, variant: Math.floor(r() * 3),
    });
  }

  // Rochers et souches
  for (let i = 0; i < 400 && list.filter((o) => o.kind === "rock").length < 90; i++) {
    const x = (r() * 2 - 1) * (OUT_HALF - 6);
    const z = (r() * 2 - 1) * (OUT_HALF - 6);
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.radius) continue;
    if (pathDistance(x, z) < 3.5) continue;
    if (Math.hypot(x - CAVE_PORTAL.x, z - CAVE_PORTAL.z) < 8) continue;
    if (list.some((o) => Math.hypot(o.x - x, o.z - z) < 2.5)) continue;
    const scale = 0.5 + r() * 1.6;
    const stump = r() < 0.15;
    list.push({
      x, z, r: stump ? 0.4 : 0.75 * scale, kind: stump ? "stump" : "rock", scale,
      rot: r() * Math.PI * 2, variant: Math.floor(r() * 3),
    });
  }

  outdoorObstacles = list;
  return list;
}

// ---------------------------------------------------------------------------
// Grotte des Échos (donjon)
// ---------------------------------------------------------------------------

/**
 * Plan du donjon, une case = DUNGEON_CELL mètres.
 * #: mur   .: sol   P: portail de sortie   S: arrivée
 * g: gelée de cristal   B: Gardien des Échos   c: cristaux (décor)
 */
export const DUNGEON_MAP = [
  "#######################",
  "#####.....#############",
  "###P.S....#####...c.###",
  "#####......###...g...##",
  "######..c....#.......##",
  "######.......#...g..###",
  "########.g.###.....####",
  "########..####..#######",
  "#####c.......g..#######",
  "#####.........c....####",
  "######..g.#####......##",
  "#####....######..g...##",
  "####..c.#######......##",
  "####....####.....c..###",
  "#####..g####..........#",
  "######...........c....#",
  "##########..c...#.B...#",
  "###########...........#",
  "################.....##",
  "#######################",
];
export const DUNGEON_CELL = 4;
const D_ROWS = DUNGEON_MAP.length;
const D_COLS = DUNGEON_MAP[0].length;

export function dungeonCellToWorld(col: number, row: number): { x: number; z: number } {
  return {
    x: (col - D_COLS / 2 + 0.5) * DUNGEON_CELL,
    z: (D_ROWS / 2 - row - 0.5) * DUNGEON_CELL,
  };
}

export function dungeonCellAt(x: number, z: number): string {
  const col = Math.floor(x / DUNGEON_CELL + D_COLS / 2);
  const row = Math.floor(D_ROWS / 2 - z / DUNGEON_CELL);
  if (row < 0 || row >= D_ROWS || col < 0 || col >= D_COLS) return "#";
  return DUNGEON_MAP[row][col];
}

function findCells(ch: string): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  DUNGEON_MAP.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (line[col] === ch) out.push(dungeonCellToWorld(col, row));
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Registre des zones
// ---------------------------------------------------------------------------

const dungeonPortal = findCells("P")[0];
const dungeonSpawn = findCells("S")[0];

export const ZONES: Record<ZoneId, ZoneDef> = {
  clairiere: {
    id: "clairiere",
    name: "Clairière de Cendrelune",
    subtitle: "Village paisible au cœur des bois",
    kind: "outdoor",
    ambiance: "printemps",
    half: OUT_HALF,
    spawn: { x: 5, z: 9 },
    portals: [
      {
        id: "vers_grotte", x: CAVE_PORTAL.x, z: CAVE_PORTAL.z, radius: 2.6, to: "grotte",
        arrival: dungeonSpawn, label: "Grotte des Échos",
      },
    ],
    mobs: [
      { kind: "gelee_verte", x: 22, z: -20, wander: 9 },
      { kind: "gelee_verte", x: 30, z: -12, wander: 9 },
      { kind: "gelee_verte", x: 14, z: -32, wander: 8 },
      { kind: "gelee_verte", x: -30, z: 4, wander: 10 },
      { kind: "gelee_verte", x: -24, z: -10, wander: 8 },
      { kind: "gelee_verte", x: 26, z: 30, wander: 10 },
      { kind: "gelee_ambre", x: 30, z: -50, wander: 6 },
      { kind: "gelee_ambre", x: 60, z: -30, wander: 6 },
      { kind: "gelee_ambre", x: -60, z: -30, wander: 9 },
      { kind: "gelee_ambre", x: 18, z: 62, wander: 9 },
    ],
  },
  grotte: {
    id: "grotte",
    name: "Grotte des Échos",
    subtitle: "Donjon · conseillé en groupe",
    kind: "dungeon",
    half: (Math.max(D_ROWS, D_COLS) * DUNGEON_CELL) / 2,
    spawn: dungeonSpawn,
    portals: [
      {
        id: "vers_clairiere", x: dungeonPortal.x, z: dungeonPortal.z, radius: 2.2, to: "clairiere",
        arrival: { x: CAVE_PORTAL.x - 5, z: CAVE_PORTAL.z + 6 }, label: "Clairière de Cendrelune",
      },
    ],
    mobs: [
      ...findCells("g").map((p) => ({ kind: "gelee_cristal" as const, x: p.x, z: p.z, wander: 3 })),
      ...findCells("B").map((p) => ({ kind: "gardien" as const, x: p.x, z: p.z, wander: 2 })),
    ],
  },
};

export const DUNGEON_CRYSTALS = findCells("c");

/** Hauteur du sol à une position. */
export function heightAt(zone: ZoneId, x: number, z: number): number {
  return ZONES[zone].kind === "outdoor" ? outdoorHeight(x, z) : 0;
}

/** Peut-on se tenir à cet endroit ? (ignore les petits obstacles du décor) */
export function isWalkable(zone: ZoneId, x: number, z: number, radius = 0): boolean {
  const def = ZONES[zone];
  if (def.kind === "outdoor") {
    const lim = def.half - 8;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    return outdoorHeight(x, z) > WATER_LEVEL - 0.9;
  }
  if (radius === 0) return dungeonCellAt(x, z) !== "#";
  for (const [ox, oz] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]) {
    if (dungeonCellAt(x + ox, z + oz) === "#") return false;
  }
  return true;
}

export function zoneObstacles(zone: ZoneId): Obstacle[] {
  return ZONES[zone].kind === "outdoor" ? getOutdoorObstacles() : [];
}

export { clamp };
