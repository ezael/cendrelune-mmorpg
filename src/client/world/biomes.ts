/**
 * Ambiances de zone (presets de biome).
 *
 * Une ambiance décrit tout ce qui donne son caractère à une zone extérieure :
 * couleurs du sol, ciel et brume, lumière, étalonnage de l'image, eau, arbres,
 * herbes, fleurs et météo. Le relief et la position des obstacles ne changent
 * pas : ils sont partagés avec le serveur. Une ambiance est donc purement visuelle.
 *
 * Pour créer une nouvelle ambiance : copier un preset ci-dessous, changer les
 * couleurs, puis l'ajouter à BIOMES. Elle est aussitôt disponible avec
 * la commande /ambiance <id> en jeu.
 */

export type WaterMode = "eau" | "glace" | "vase" | "braise";
export type WeatherKind = "pollen" | "feuilles" | "neige" | "brume" | "cendres";

export interface Biome {
  id: string;
  name: string;
  /** Une phrase d'ambiance, affichée quand on change d'ambiance. */
  mood: string;

  /** Couleurs du sol, mélangées par le shader de terrain. */
  ground: {
    grassA: string;
    grassB: string;
    grassDry: string;
    /** Sous-bois : sol plus sombre et moussu sous les arbres. */
    moss: string;
    dirt: string;
    dirtDark: string;
    cobble: string;
    rock: string;
    rockDark: string;
    sand: string;
    lakebed: string;
    snow: string;
    /** Couverture neigeuse des sols plats, de 0 à 1. */
    snowCover: number;
    /** Altitude des neiges éternelles sur les montagnes. */
    snowLine: number;
    /** Lueur dans les fissures de la roche (Terres de cendre), sinon noir. */
    emberGlow: string;
  };

  /** Ciel et brume : teinte appliquée au cycle jour/nuit commun. */
  sky: {
    tint: string;
    amount: number;
    horizonTint: string;
    horizonAmount: number;
    fogTint: string;
    fogAmount: number;
    sunTint: string;
    sunAmount: number;
    /** Multiplie la lumière directe du soleil (ciel couvert < 1). */
    sunPower: number;
    fogDensity: number;
  };

  /** Étalonnage de l'image (post-traitement). */
  grade: {
    exposure: number;
    contrast: number;
    /** -100 à 100. */
    saturation: number;
    /** Teinte globale (0-360) et sa force (0-100). */
    hue: number;
    hueAmount: number;
  };

  water: { mode: WaterMode; deep: string; shallow: string; foam: string };

  vegetation: {
    /** Palettes des trois variantes de sapins (bas, milieu, haut). */
    pines: string[][];
    /** Palettes des trois variantes de feuillus ; null = arbre nu. */
    oaks: Array<string[] | null>;
    trunk: string;
    /** Neige sur les branches. */
    snowyTrees: boolean;
    rockTint: string;
    grassBase: string;
    grassTip: string;
    /** Multiplicateur de densité des herbes. */
    grassDensity: number;
    grassHeight: number;
    flowers: string[];
    /** Les fleurs brillent la nuit (braises, champignons…). */
    glowingFlowers: boolean;
    flowerChance: number;
    wind: number;
  };

  weather: { kind: WeatherKind; amount: number; color: string; color2: string };
  /** Lucioles la nuit. */
  fireflies: boolean;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRINTEMPS: Biome = {
  id: "printemps",
  name: "Printemps de Cendrelune",
  mood: "L'herbe est haute, les cerisiers sont en fleurs et le pollen danse dans la lumière.",
  ground: {
    grassA: "#4d8a3a", grassB: "#7fae4c", grassDry: "#b0a85a", moss: "#3a6a32",
    dirt: "#b48d5c", dirtDark: "#80603d", cobble: "#a39a8c", rock: "#9a948c", rockDark: "#6a6660",
    sand: "#dcc78f", lakebed: "#6f8466", snow: "#f1f4f8", snowCover: 0, snowLine: 23, emberGlow: "#000000",
  },
  sky: {
    tint: "#4f8fe0", amount: 0, horizonTint: "#ffe6c4", horizonAmount: 0.12, fogTint: "#d8ecff", fogAmount: 0.1,
    sunTint: "#fff4dc", sunAmount: 0.1, sunPower: 1.0, fogDensity: 0.0068,
  },
  grade: { exposure: 1.15, contrast: 1.16, saturation: 2, hue: 40, hueAmount: 4 },
  water: { mode: "eau", deep: "#1c5f8a", shallow: "#43b3c0", foam: "#eef8ff" },
  vegetation: {
    pines: [
      ["#3f7d3a", "#4e9445", "#5fa850"],
      ["#2f6b46", "#3c7f52", "#4a935e"],
      ["#5a8f34", "#6fa83e", "#86bd4a"],
    ],
    oaks: [
      ["#6aa83f", "#7dbd48", "#93cf56"],
      ["#f0a2c0", "#f6bcd2", "#fbd6e3"], // cerisier en fleurs
      ["#4f9a4a", "#62ad55", "#77c262"],
    ],
    trunk: "#6b4a2f", snowyTrees: false, rockTint: "#ffffff",
    grassBase: "#3d7230", grassTip: "#9cc45e", grassDensity: 1.0, grassHeight: 1.0,
    flowers: ["#fff6e0", "#ffd34d", "#ff7aa8", "#9fb8ff", "#c79bff"], glowingFlowers: false, flowerChance: 0.2, wind: 1.0,
  },
  weather: { kind: "pollen", amount: 1, color: "#fff7c2", color2: "#ffffff" },
  fireflies: true,
};

const AUTOMNE: Biome = {
  id: "automne",
  name: "Automne doré",
  mood: "Les feuilles rousses tombent en tourbillons sur les sentiers tièdes.",
  ground: {
    grassA: "#7d8a3a", grassB: "#b39a45", grassDry: "#c98a3c", moss: "#6b5a2e",
    dirt: "#a87648", dirtDark: "#6e4a2c", cobble: "#9c8f80", rock: "#948a80", rockDark: "#615850",
    sand: "#d6b880", lakebed: "#6a6650", snow: "#f1f4f8", snowCover: 0, snowLine: 25, emberGlow: "#000000",
  },
  sky: {
    tint: "#5a86c8", amount: 0.15, horizonTint: "#ffc58a", horizonAmount: 0.35, fogTint: "#e8c49a", fogAmount: 0.35,
    sunTint: "#ffc070", sunAmount: 0.35, sunPower: 1.0, fogDensity: 0.0078,
  },
  grade: { exposure: 1.12, contrast: 1.2, saturation: 18, hue: 35, hueAmount: 10 },
  water: { mode: "eau", deep: "#24516a", shallow: "#4f9a9a", foam: "#fff4e0" },
  vegetation: {
    pines: [
      ["#35603a", "#41713f", "#4f8246"],
      ["#2c5340", "#386449", "#457553"],
      ["#4b6b30", "#5c7d38", "#6f9142"],
    ],
    oaks: [
      ["#d0702a", "#e0873a", "#eea04c"],
      ["#b8402c", "#cf563a", "#e2704a"],
      ["#d8a232", "#e8b842", "#f4cf5a"],
    ],
    trunk: "#5e3f28", snowyTrees: false, rockTint: "#f4e8dc",
    grassBase: "#6a6a2c", grassTip: "#d0a24c", grassDensity: 0.9, grassHeight: 1.0,
    flowers: ["#e04a2a", "#f2a23a", "#fff0d0"], glowingFlowers: false, flowerChance: 0.08, wind: 1.3,
  },
  weather: { kind: "feuilles", amount: 1, color: "#e0782a", color2: "#f2c040" },
  fireflies: false,
};

const HIVER: Biome = {
  id: "hiver",
  name: "Hiver du Nord",
  mood: "La neige étouffe les pas. Le lac a gelé : on peut marcher dessus.",
  ground: {
    grassA: "#7a8f6a", grassB: "#94a382", grassDry: "#a8a088", moss: "#5d6e58",
    dirt: "#8f7e6c", dirtDark: "#5f5246", cobble: "#9a9ca4", rock: "#8d929c", rockDark: "#5a5f6a",
    sand: "#c9c4b8", lakebed: "#6a7480", snow: "#eef3fc", snowCover: 0.92, snowLine: 8, emberGlow: "#000000",
  },
  sky: {
    tint: "#8ea6c4", amount: 0.55, horizonTint: "#e4ecf6", horizonAmount: 0.6, fogTint: "#dfe7f2", fogAmount: 0.7,
    sunTint: "#e8f0ff", sunAmount: 0.5, sunPower: 0.8, fogDensity: 0.0105,
  },
  grade: { exposure: 1.08, contrast: 1.1, saturation: -18, hue: 210, hueAmount: 8 },
  water: { mode: "glace", deep: "#4f7fae", shallow: "#a9cfe8", foam: "#f4fbff" },
  vegetation: {
    pines: [
      ["#28503e", "#2f5d47", "#386b52"],
      ["#22473a", "#2a5444", "#33614e"],
      ["#2f5a40", "#386a4a", "#427a55"],
    ],
    oaks: [null, null, null],
    trunk: "#4d3a2c", snowyTrees: true, rockTint: "#dfe6f2",
    grassBase: "#8a9278", grassTip: "#d8dccf", grassDensity: 0.35, grassHeight: 0.7,
    flowers: [], glowingFlowers: false, flowerChance: 0, wind: 0.6,
  },
  weather: { kind: "neige", amount: 1, color: "#ffffff", color2: "#e6f0ff" },
  fireflies: false,
};

const MARAIS: Biome = {
  id: "marais",
  name: "Marais des Brumes",
  mood: "Une brume verdâtre rampe sur la vase. Quelque chose bouge sous les nénuphars.",
  ground: {
    grassA: "#3d5a32", grassB: "#5b7340", grassDry: "#7a7a48", moss: "#2f4a2c",
    dirt: "#5e5238", dirtDark: "#3a3324", cobble: "#6e7066", rock: "#6c7068", rockDark: "#44483f",
    sand: "#6e6a4c", lakebed: "#3a4430", snow: "#f1f4f8", snowCover: 0, snowLine: 30, emberGlow: "#000000",
  },
  sky: {
    tint: "#6f8a7c", amount: 0.55, horizonTint: "#b4c4a8", horizonAmount: 0.6, fogTint: "#8fa08a", fogAmount: 0.75,
    sunTint: "#e0f0c8", sunAmount: 0.4, sunPower: 0.65, fogDensity: 0.016,
  },
  grade: { exposure: 1.1, contrast: 1.14, saturation: -10, hue: 110, hueAmount: 14 },
  water: { mode: "vase", deep: "#1f3326", shallow: "#4a5e34", foam: "#a8b890" },
  vegetation: {
    pines: [
      ["#1f3d32", "#264838", "#2e5440"],
      ["#1c3830", "#22423a", "#2a4e44"],
      ["#2a4632", "#32523a", "#3c5e42"],
    ],
    oaks: [
      ["#3e5a2a", "#4a6a30", "#587a38"],
      ["#34502e", "#3e5e34", "#4a6c3c"],
      null,
    ],
    trunk: "#3e3226", snowyTrees: false, rockTint: "#c8d4b8",
    grassBase: "#2c4024", grassTip: "#7f9a4a", grassDensity: 1.25, grassHeight: 1.6,
    flowers: ["#b8f0ff", "#e8ffd0"], glowingFlowers: true, flowerChance: 0.06, wind: 0.5,
  },
  weather: { kind: "brume", amount: 1, color: "#b8c8b0", color2: "#d0dcc8" },
  fireflies: true,
};

const CENDRES: Biome = {
  id: "cendres",
  name: "Terres de cendre",
  mood: "Le sol est encore chaud. Des braises dérivent dans un ciel couleur de rouille.",
  ground: {
    grassA: "#4a4440", grassB: "#5e5650", grassDry: "#6e6250", moss: "#2e2a28",
    dirt: "#3a3230", dirtDark: "#221e1d", cobble: "#5a524e", rock: "#4a4442", rockDark: "#262222",
    sand: "#6a625a", lakebed: "#1a1414", snow: "#c8c2bc", snowCover: 0, snowLine: 26, emberGlow: "#ff5a1a",
  },
  sky: {
    tint: "#5a3a3a", amount: 0.75, horizonTint: "#ff8a4a", horizonAmount: 0.65, fogTint: "#8a5a48", fogAmount: 0.75,
    sunTint: "#ffa060", sunAmount: 0.65, sunPower: 0.85, fogDensity: 0.012,
  },
  grade: { exposure: 1.12, contrast: 1.24, saturation: -6, hue: 20, hueAmount: 16 },
  water: { mode: "braise", deep: "#140c0a", shallow: "#2a1a16", foam: "#ff6a1a" },
  vegetation: {
    pines: [
      ["#3a3634", "#45403c", "#504a44"],
      ["#2e2a28", "#383330", "#423c38"],
      ["#4a4038", "#564a40", "#625448"],
    ],
    oaks: [null, null, ["#5a4a3a", "#6a5644", "#7a624e"]],
    trunk: "#1e1a18", snowyTrees: false, rockTint: "#9a9090",
    grassBase: "#2a2624", grassTip: "#7a6a58", grassDensity: 0.4, grassHeight: 0.8,
    flowers: ["#ff6a1a", "#ffb03a"], glowingFlowers: true, flowerChance: 0.12, wind: 0.8,
  },
  weather: { kind: "cendres", amount: 1, color: "#ff7a2a", color2: "#ffc060" },
  fireflies: false,
};

export const BIOMES: Record<string, Biome> = {
  printemps: PRINTEMPS,
  automne: AUTOMNE,
  hiver: HIVER,
  marais: MARAIS,
  cendres: CENDRES,
};

export const DEFAULT_BIOME = "printemps";

// ---------------------------------------------------------------------------
// Choix de l'ambiance active
// ---------------------------------------------------------------------------

const STORE_KEY = "cendrelune.ambiance";

/** Retrouve une ambiance par son id ou par un nom approché (« Hiver », « cendre »…). */
export function findBiome(query: string): Biome | null {
  const q = query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!q) return null;
  if (BIOMES[q]) return BIOMES[q];
  return Object.values(BIOMES).find((b) => b.id.startsWith(q) || q.startsWith(b.id.slice(0, 5))) ?? null;
}

let forced: string | null = (() => {
  if (typeof location === "undefined") return null;
  const fromUrl = new URLSearchParams(location.search).get("ambiance");
  if (fromUrl && findBiome(fromUrl)) return findBiome(fromUrl)!.id;
  try {
    const saved = localStorage.getItem(STORE_KEY);
    return saved && BIOMES[saved] ? saved : null;
  } catch {
    return null;
  }
})();

/**
 * Ambiance à utiliser pour une zone : celle de la zone par défaut, sauf si le
 * joueur en a choisi une autre pour l'essayer (commande /ambiance ou ?ambiance=).
 */
export function activeBiome(zoneDefault?: string): Biome {
  return BIOMES[forced ?? zoneDefault ?? DEFAULT_BIOME] ?? PRINTEMPS;
}

/** Force une ambiance d'essai (null = revenir à celle prévue pour la zone). */
export function setForcedBiome(id: string | null) {
  forced = id;
  try {
    if (id) localStorage.setItem(STORE_KEY, id);
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* navigation privée */
  }
}
