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
