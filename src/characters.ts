/**
 * Stockage des personnages EN MÉMOIRE (prototype).
 * Les personnages survivent aux changements de zone et aux reconnexions tant que
 * le serveur tourne. Étape suivante prévue : PostgreSQL.
 */
import { randomBytes } from "node:crypto";
import type { ZoneId } from "./shared/zones.js";

export interface CharacterRecord {
  name: string;
  color: string;
  level: number;
  xp: number;
  hp: number;
}

const store = new Map<string, CharacterRecord>();

export const characters = {
  load(name: string): CharacterRecord | undefined {
    const rec = store.get(name.toLowerCase());
    return rec ? { ...rec } : undefined;
  },
  save(rec: CharacterRecord) {
    store.set(rec.name.toLowerCase(), { ...rec });
  },
};

interface Ticket {
  to: ZoneId;
  x: number;
  z: number;
  character: CharacterRecord;
  expires: number;
}

const tickets = new Map<string, Ticket>();

/** Billets de voyage : un portail confie le personnage à la zone suivante. */
export const travelTickets = {
  issue(t: Omit<Ticket, "expires">): string {
    const id = randomBytes(12).toString("hex");
    tickets.set(id, { ...t, expires: Date.now() + 60_000 });
    for (const [k, v] of tickets) if (v.expires < Date.now()) tickets.delete(k);
    return id;
  },
  take(id: string): Ticket | undefined {
    const t = tickets.get(id);
    tickets.delete(id);
    return t && t.expires >= Date.now() ? t : undefined;
  },
};
