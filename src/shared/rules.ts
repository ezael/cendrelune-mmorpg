/**
 * Règles de jeu partagées entre le client et le serveur.
 * Le serveur fait autorité : le client s'en sert seulement pour prédire et afficher.
 */

export const SERVER_TICK_MS = 50; // 20 mises à jour par seconde
export const CLIENT_SEND_MS = 66; // le client envoie sa position ~15 fois par seconde

export const RUN_SPEED = 7;
export const WALK_SPEED = 3;
export const PLAYER_RADIUS = 0.45;

export const ATTACK_RANGE = 3.2;
export const ATTACK_COOLDOWN_MS = 1400;
export const HEAL_RANGE = 20;
export const HEAL_COOLDOWN_MS = 8000;
export const HEAL_AMOUNT = 35;

export const MAX_NAME_LENGTH = 16;
export const MAX_CHAT_LENGTH = 160;

/** Durée d'une journée complète dans le jeu (jour + nuit), en secondes réelles. */
export const DAY_LENGTH_S = 8 * 60;

export function playerMaxHp(level: number): number {
  return 80 + level * 20;
}

export function playerDamage(level: number): [number, number] {
  return [8 + level * 2, 14 + level * 3];
}

export function xpToNextLevel(level: number): number {
  return level * 100;
}

/** Palette des tuniques que le joueur peut choisir à la création. */
export const TUNIC_COLORS = [
  "#c0392b", // carmin
  "#2e86de", // azur
  "#27ae60", // émeraude
  "#8e44ad", // améthyste
  "#e67e22", // ambre
  "#16a085", // sarcelle
  "#f1c40f", // or
  "#ecf0f1", // ivoire
];

export type MobKindId = "gelee_verte" | "gelee_ambre" | "gelee_cristal" | "gardien";

export interface MobKind {
  id: MobKindId;
  name: string;
  level: number;
  hp: number;
  damage: [number, number];
  attackMs: number;
  speed: number;
  /** 0 : passif tant qu'on ne l'attaque pas. Sinon, rayon d'agression en mètres. */
  aggroRadius: number;
  scale: number;
  color: string;
  glow?: string;
  respawnMs: number;
  boss?: boolean;
}

export const MOB_KINDS: Record<MobKindId, MobKind> = {
  gelee_verte: {
    id: "gelee_verte", name: "Gelée verte", level: 1, hp: 40, damage: [2, 4],
    attackMs: 1800, speed: 2.2, aggroRadius: 0, scale: 0.9, color: "#6fcf4a",
    respawnMs: 15000,
  },
  gelee_ambre: {
    id: "gelee_ambre", name: "Gelée d'ambre", level: 2, hp: 65, damage: [3, 6],
    attackMs: 1700, speed: 2.6, aggroRadius: 8, scale: 1.05, color: "#f0a030",
    respawnMs: 18000,
  },
  gelee_cristal: {
    id: "gelee_cristal", name: "Gelée de cristal", level: 3, hp: 95, damage: [4, 8],
    attackMs: 1600, speed: 2.8, aggroRadius: 9, scale: 1.1, color: "#5fd0ff",
    glow: "#3fa8ff", respawnMs: 20000,
  },
  gardien: {
    id: "gardien", name: "Gardien des Échos", level: 6, hp: 650, damage: [9, 15],
    attackMs: 2000, speed: 2.4, aggroRadius: 11, scale: 2.8, color: "#a070ff",
    glow: "#c090ff", respawnMs: 60000, boss: true,
  },
};

export function mobXp(kind: MobKind): number {
  return kind.level * 25 * (kind.boss ? 6 : 1);
}

export function mobRadius(kind: MobKind): number {
  return 0.55 * kind.scale;
}
