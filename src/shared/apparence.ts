/**
 * Races jouables et apparence des personnages (partagé client / serveur).
 * L'apparence voyage sous forme d'une courte chaîne JSON (champ `look` du joueur)
 * et le serveur la valide avant de l'accepter.
 */
import { TUNIC_COLORS } from "./rules.js";

export type RaceId = "humain" | "sylvain" | "roncenain" | "cendrin";
export type CorpsId = "homme" | "femme";

export const COIFFURES = ["Hair_SimpleParted", "Hair_Long", "Hair_Buns", "Hair_Buzzed", "Hair_BuzzedFemale", "aucune"] as const;
export type CoiffureId = (typeof COIFFURES)[number];
export const NOMS_COIFFURES: Record<CoiffureId, string> = {
  Hair_SimpleParted: "Raie de côté",
  Hair_Long: "Longs",
  Hair_Buns: "Chignons",
  Hair_Buzzed: "Ras",
  Hair_BuzzedFemale: "Courts",
  aucune: "Crâne nu",
};

/** Proportions appliquées au squelette (1 = humain). */
export interface Proportions {
  taille: number;
  tete: number;
  mains: number;
  largeur: number;
  jambes: number;
  bras: number;
}

export interface Race {
  id: RaceId;
  nom: string;
  pluriel: string;
  devise: string;
  description: string;
  proportions: Proportions;
  peaux: string[];
  cheveux: string[];
  /** coiffure proposée par défaut selon le corps */
  coiffureDefaut: Record<CorpsId, CoiffureId>;
  barbeDefaut: boolean;
  oreilles?: "pointues";
  cornes?: boolean;
  yeuxLuisants?: string;
}

export const RACES: Record<RaceId, Race> = {
  humain: {
    id: "humain",
    nom: "Humain",
    pluriel: "Humains",
    devise: "Les bâtisseurs de la Clairière",
    description: "Tenaces et adaptables, ils ont relevé les villages après la Pluie de cendres.",
    proportions: { taille: 1, tete: 1, mains: 1, largeur: 1, jambes: 1, bras: 1 },
    peaux: ["#f3d2b3", "#e2b089", "#c98e62", "#9b6643", "#6e4a32"],
    cheveux: ["#2b1d14", "#5a3a22", "#8a5a2e", "#c9a05a", "#e8d8a8", "#9a3b24", "#8a8a8a"],
    coiffureDefaut: { homme: "Hair_SimpleParted", femme: "Hair_Long" },
    barbeDefaut: false,
  },
  sylvain: {
    id: "sylvain",
    nom: "Sylvain",
    pluriel: "Sylvains",
    devise: "Les gardiens des forêts anciennes",
    description: "Grands et élancés, ils entendent la sève chanter sous l'écorce.",
    proportions: { taille: 1.07, tete: 0.96, mains: 0.96, largeur: 0.9, jambes: 1.05, bras: 1.02 },
    peaux: ["#f6e3d0", "#efd5bd", "#d9b48f", "#b98a64", "#e3d3c6"],
    cheveux: ["#f2e6c4", "#d8c08a", "#c4c8d0", "#3a2a1e", "#7a3a1e", "#4a5a3a"],
    coiffureDefaut: { homme: "Hair_Long", femme: "Hair_Long" },
    barbeDefaut: false,
    oreilles: "pointues",
  },
  roncenain: {
    id: "roncenain",
    nom: "Roncenain",
    pluriel: "Roncenains",
    devise: "Les forgerons des montagnes",
    description: "Trapus et têtus comme la roche, ils creusent les mines sous les Monts gris.",
    proportions: { taille: 0.8, tete: 1.12, mains: 1.25, largeur: 1.32, jambes: 0.72, bras: 0.9 },
    peaux: ["#f0c8a8", "#d9a27a", "#b77a52", "#8e5a3c"],
    cheveux: ["#8a3b1e", "#c06a2a", "#3a2418", "#6a4a32", "#b8b0a8", "#e0c890"],
    coiffureDefaut: { homme: "Hair_SimpleParted", femme: "Hair_Buns" },
    barbeDefaut: true,
  },
  cendrin: {
    id: "cendrin",
    nom: "Cendrin",
    pluriel: "Cendrins",
    devise: "Les enfants de la braise",
    description: "Nés des cendres de l'ancienne lune, leur regard garde la lueur des braises.",
    proportions: { taille: 1.1, tete: 1, mains: 1.1, largeur: 1.12, jambes: 1, bras: 1.02 },
    peaux: ["#7d8088", "#5f636c", "#8a7f78", "#4a4d56", "#a09488"],
    cheveux: ["#1a1a1e", "#3a3a40", "#d8d8e0", "#7a2a1a"],
    coiffureDefaut: { homme: "Hair_Buzzed", femme: "Hair_Long" },
    barbeDefaut: false,
    cornes: true,
    yeuxLuisants: "#ffae3a",
  },
};
export const RACE_IDS = Object.keys(RACES) as RaceId[];

export interface Apparence {
  race: RaceId;
  corps: CorpsId;
  /** index dans la palette de peau de la race */
  peau: number;
  coiffure: CoiffureId;
  /** index dans la palette de cheveux de la race */
  cheveux: number;
  barbe: boolean;
  /** couleur de la tunique (une des TUNIC_COLORS) */
  tenue: string;
}

export function apparenceParDefaut(race: RaceId = "humain", corps: CorpsId = "homme", tenue = TUNIC_COLORS[0]): Apparence {
  const r = RACES[race];
  return { race, corps, peau: 1 % r.peaux.length, coiffure: r.coiffureDefaut[corps], cheveux: 0, barbe: r.barbeDefaut && corps === "homme", tenue };
}

/** Valide une apparence reçue (du réseau ou du stockage) ; renvoie toujours une apparence correcte. */
export function nettoyerApparence(raw: unknown, tenueSecours = TUNIC_COLORS[0]): Apparence {
  let o: Partial<Apparence> = {};
  try {
    o = (typeof raw === "string" ? JSON.parse(raw) : raw) ?? {};
  } catch {
    o = {};
  }
  const race: RaceId = RACE_IDS.includes(o.race as RaceId) ? (o.race as RaceId) : "humain";
  const corps: CorpsId = o.corps === "femme" ? "femme" : "homme";
  const r = RACES[race];
  const idx = (v: unknown, n: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : 0);
  return {
    race,
    corps,
    peau: idx(o.peau, r.peaux.length),
    coiffure: COIFFURES.includes(o.coiffure as CoiffureId) ? (o.coiffure as CoiffureId) : r.coiffureDefaut[corps],
    cheveux: idx(o.cheveux, r.cheveux.length),
    barbe: corps === "homme" && o.barbe === true,
    tenue: TUNIC_COLORS.includes(o.tenue ?? "") ? o.tenue! : tenueSecours,
  };
}

export function encoderApparence(a: Apparence): string {
  return JSON.stringify(a);
}
