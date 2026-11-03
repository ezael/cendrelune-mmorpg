import { defineServer, defineRoom } from "colyseus";
import { ZoneRoom } from "./rooms/ZoneRoom.js";

/**
 * Serveur de jeu Cendrelune. Chaque zone est un type de room Colyseus :
 * changer de zone revient à quitter une room et à en rejoindre une autre.
 */
const server = defineServer({
  rooms: {
    clairiere: defineRoom(ZoneRoom, { zoneId: "clairiere" }),
    grotte: defineRoom(ZoneRoom, { zoneId: "grotte" }),
  },
  express: (app) => {
    app.get("/api/status", (_req, res) => {
      res.json({ ok: true, game: "Cendrelune", time: new Date().toISOString() });
    });
  },
});

export default server;

/** Export nommé lu par le plugin `colyseus/vite` (build de production). */
export { server };
