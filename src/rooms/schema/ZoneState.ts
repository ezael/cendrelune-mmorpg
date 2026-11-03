import { schema, t, type SchemaType } from "@colyseus/schema";

/** Un joueur présent dans la zone. Synchronisé avec tous les clients de la zone. */
export const Player = schema({
  name: t.string(),
  color: t.string(),
  /** apparence (race, corps, couleurs…) en JSON court, validée par le serveur */
  look: t.string(),
  x: t.number(),
  y: t.number(),
  z: t.number(),
  ry: t.number(),
  /** 0 repos, 1 marche, 2 course, 3 saut */
  anim: t.uint8(),
  level: t.uint8(),
  xp: t.uint16(),
  hp: t.int16(),
  maxHp: t.int16(),
  targetId: t.string(),
  dead: t.boolean(),
});
export type Player = SchemaType<typeof Player>;

/** Un monstre, piloté uniquement par le serveur. */
export const Mob = schema({
  kind: t.string(),
  x: t.number(),
  z: t.number(),
  ry: t.number(),
  hp: t.int16(),
  maxHp: t.int16(),
  /** 0 repos, 1 déplacement, 2 combat, 3 mort */
  mode: t.uint8(),
  targetId: t.string(),
});
export type Mob = SchemaType<typeof Mob>;

export const ZoneState = schema({
  zoneId: t.string(),
  /** Heure du jour dans [0, 1[ : 0 minuit, 0.25 aube, 0.5 midi, 0.75 crépuscule. */
  timeOfDay: t.float32(),
  players: t.map(Player),
  mobs: t.map(Mob),
});
export type ZoneState = SchemaType<typeof ZoneState>;
