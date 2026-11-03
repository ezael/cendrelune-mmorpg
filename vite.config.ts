import { defineConfig } from "vite";
import { colyseus } from "colyseus/vite";

// Un seul projet Vite : le plugin Colyseus démarre le serveur de jeu dans le
// même processus en développement, et produit dist/client + dist/server au build.
export default defineConfig(({ mode }) => ({
  build: { outDir: "dist/client", chunkSizeWarningLimit: 6000 },
  server: { host: true },
  plugins: [
    ...(mode === "client"
      ? []
      : [colyseus({ serverEntry: "/src/app.config.ts", serveClient: true })]),
  ],
}));
