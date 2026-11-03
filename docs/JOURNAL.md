# Journal de Cendrelune

Ce fichier garde la trace des décisions et des étapes du projet. Les entrées les plus récentes sont en haut.

## 2026-11-03 : prototype 0.1, une zone de test jouable

**Rôles.** Thierry est le directeur créatif. Claude écrit le code, crée les assets et fait le game design.

### Décisions

- **Cible : le navigateur.** Le jeu tourne sur Mac sans installation et se partage facilement.
- **Stack : TypeScript partout.**
  - Client : Babylon.js 9 (Apache 2.0).
  - Serveur : Node.js + Colyseus 0.18 (MIT).
  - Build : Vite 8 (MIT).
  - Persistance : en mémoire pour ce prototype ; PostgreSQL ensuite.
- **Pourquoi pas Godot.** Godot 4 n'exporte toujours pas les projets C# vers le web, et il se pilote surtout par son éditeur visuel. Une stack 100 % code convient mieux, puisque Claude écrit tout.
- **Pourquoi pas Unity ou Unreal.** Ce sont des moteurs propriétaires, plus lourds, et peu adaptés au web pour un petit projet.
- **Assets générés en code.** Les décors, personnages et monstres sont low-poly et stylisés, sans aucun fichier externe. On pourra compléter plus tard avec des packs CC0 (Kenney, Quaternius, Poly Haven).
- **Contrôles : clavier + souris**, sans manette pour l'instant. On utilise `KeyboardEvent.code`, donc ZQSD (AZERTY) et WASD (QWERTY) fonctionnent sans réglage.
- **Lancement local** : un double-clic sur `Lancer Cendrelune.command`, qui installe, construit, démarre le serveur et ouvre le navigateur.

### Ce qui a été fait

- Deux zones, reliées par des passages runiques :
  - la **Clairière de Cendrelune** : village, lac, forêt, montagnes, chemins ;
  - la **Grotte des Échos** : donjon, torches, cristaux, boss.
- Un serveur autoritaire :
  - validation des déplacements ;
  - IA des monstres : errance, agression, laisse, réapparition ;
  - combat, XP partagée en groupe avec bonus, montée de niveau, mort et réapparition ;
  - heure du jour commune à tout le serveur.
- Un client :
  - personnage humanoïde animé en code (course, saut, attaque, sort, salut, assis, mort) ;
  - monstres « gelées » ;
  - cycle jour/nuit, ombres, bloom, brouillard, particules (feu, fumée, lucioles, poussière) ;
  - eau animée.
- Une interface : cadres du joueur et de la cible, mini-carte, chat avec bulles, barre d'actions, dégâts flottants, couleur de difficulté façon old-school, bannière de zone, écran de chargement.
- Un mode qualité basse : `?qualite=basse`.

### Tests réalisés

- Build de production et installation propre (`npm ci`), sans erreur.
- Deux navigateurs headless connectés en même temps : chat, combat jusqu'à la mort d'une gelée, gain d'XP.
- Passage de la clairière à la grotte, la nuit et au coucher du soleil.
- Mort du joueur et réapparition.

### Limites connues et prochaines étapes

- Personnages en mémoire : ils sont perdus quand le serveur redémarre. Prochaine étape : **PostgreSQL** et de vrais comptes.
- Pas encore de système de groupe formel (invitation, chef de groupe, cadres des membres).
- Pas de sons ni de musique.
- La caméra peut passer à travers les maisons ; elle ne bute que sur le relief et les murs.
- Le bundle client est lourd (environ 7 Mo, tout Babylon.js est importé) : on l'allégera avec des imports ciblés.
- Idées à suivre : classes (guerrier, clerc, mage…), inventaire et butin, quêtes, PNJ au village, nouvelles zones.

## 2026-11-03 — Plan pour le design des personnages et des races

- **Constat** : les personnages, faits de primitives sans squelette, font « cubiques ».
- **Proposition** (voir `docs/PLAN-PERSONNAGES.md`) : une base humanoïde CC0 (Quaternius, *Universal Base Characters* et *Universal Animation Library*), dont on dérive les races, avec le reciblage d'animations de Babylon 9 (`AnimatorAvatar`).
- **Races proposées pour la v1** : Humains, Sylvains, Roncenains, Cendrins. Pour plus tard : Pieds-Légers, Lunaires.
- **Décision du 03/11 (18 h 39)** : Thierry valide l'option B (base CC0 et races dérivées). Les races et le style restent à trancher.
- **Obstacle** : le réseau bloque quaternius.com et itch.io. Thierry télécharge les packs à la main dans `_sources-assets/`.

## 2026-11-03 — Essai technique des personnages CC0 et choix du style

- **Packs** : Quaternius *Universal Base Characters* et *Universal Animation Library*, version Standard gratuite, licence CC0 (fichiers de licence dans `public/assets/characters/`). Contenu de la version gratuite : 2 corps athlétiques (homme et femme), 8 pièces (cheveux, barbe, sourcils), 43 animations. Pas de vêtements.
- **Technique** (`src/client/labo/personnage-cc0.ts`) :
  - le corps et les animations ont les mêmes noms d'os, donc pas besoin de reciblage : on ne garde que les rotations, plus la translation du bassin ;
  - les races sont obtenues par mise à l'échelle des os (exemple : un nain) ;
  - les vêtements sont des « coques » découpées dans le corps, lissées puis gonflées, et elles suivent les animations.
- **Labo** : `labo.html` (en jeu local, http://localhost:2567/labo.html, avec `?scene=styles|portrait|races|foule`).
- **Décision de Thierry (03/11, 20 h 58)** : on retient le **style B, intermédiaire**. Il se caractérise par une tête un peu plus grosse (+14 %), des textures conservées, un relief adouci et un léger ombrage en paliers.
- **Code** : branche `claude/project-thread-e4w9yy`, PR #3.
- **À venir** : intégrer les nouveaux personnages dans le jeu (étape 1 du plan), puis choisir les races et leurs noms.
