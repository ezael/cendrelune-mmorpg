import { defineConfig } from "vite";
import { colyseus } from "colyseus/vite";

// Un seul projet Vite : le plugin Colyseus démarre le serveur de jeu dans le
// même processus en développement, et produit dist/client + dist/server au build.
export default defineConfig(({ mode }) => ({
  build: { outDir: "dist/client", chunkSizeWarningLimit: 6000 },
  server: { host: true },
  // labo.html : planche de test des personnages (page à part, non liée depuis le jeu)
  environments: { client: { build: { rollupOptions: { input: { main: "index.html", labo: "labo.html" } } } } },
  plugins: [
    ...(mode === "client"
      ? []
      : [colyseus({ serverEntry: "/src/app.config.ts", serveClient: true })]),
  ],
}));
