#!/bin/bash
# ---------------------------------------------------------------------------
#  Cendrelune : double-clique sur ce fichier pour lancer le serveur et le jeu.
#  Pour arrêter le serveur : ferme cette fenêtre de Terminal (ou Ctrl + C).
# ---------------------------------------------------------------------------
cd "$(dirname "$0")" || exit 1
PORT=2567
URL="http://localhost:$PORT"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║            C E N D R E L U N E       ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

pause_and_exit() {
  echo ""
  read -r -p "Appuie sur Entrée pour fermer cette fenêtre…" _
  exit 1
}

# 1. Node.js est-il installé ?
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js est introuvable."
  echo "   Installe la version LTS depuis https://nodejs.org puis relance ce fichier."
  open "https://nodejs.org" 2>/dev/null
  pause_and_exit
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "❌ Node.js $(node -v) est trop ancien : il faut la version 22 ou plus récente."
  pause_and_exit
fi
echo "✓ Node.js $(node -v)"

# 2. Le serveur tourne-t-il déjà ?
if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✓ Le serveur tourne déjà : j'ouvre le jeu dans le navigateur."
  open "$URL"
  sleep 2
  exit 0
fi

# 3. Installation des dépendances (première fois, ou après une mise à jour)
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "… Installation des dépendances (une minute environ la première fois)"
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund || pause_and_exit
fi
echo "✓ Dépendances prêtes"

# 4. Construction du jeu
echo "… Préparation du jeu"
npm run build --silent >/tmp/cendrelune-build.log 2>&1 || { cat /tmp/cendrelune-build.log; echo "❌ La construction a échoué."; pause_and_exit; }
echo "✓ Jeu prêt"

# 5. Démarrage du serveur et ouverture du navigateur
echo ""
echo "▶ Serveur lancé sur $URL"
echo "  Pour jouer à plusieurs sur ton Mac : ouvre un deuxième onglet à la même adresse."
echo "  Pour arrêter : ferme cette fenêtre."
echo ""
( sleep 2; open "$URL" ) &
exec node dist/server/server.mjs
