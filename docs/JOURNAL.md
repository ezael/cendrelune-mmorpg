# Journal de Cendrelune

Ce fichier garde la trace des décisions et des étapes du projet. Les entrées les plus récentes sont en haut.

## 2026-11-03 : nouveaux personnages et 4 races dans le jeu

Demande de Thierry : « go, fait la totale ». Il faut donc intégrer les personnages au style B dans le jeu, avec les races et un écran de création. Il a ajouté une deuxième demande : Q/D doivent faire tourner le personnage, et les touches équivalentes en QWERTY aussi.

### Ce qui a été fait

- **Nouvel avatar** (`src/client/entities/avatar.ts`) : il remplace l'ancien personnage en cubes, partout dans le jeu, pour soi, pour les autres joueurs et dans les deux zones.
  - Il utilise le corps CC0 de Quaternius et ses animations : repos, marche, course, sprint, saut, attaque à l'épée, sort, coup reçu, mort et assis.
  - Les animations sont en deux couches (jambes et haut du corps), ce qui permet d'attaquer en courant.
  - La vitesse de l'animation suit la vitesse réelle. La marche arrière joue l'animation à l'envers.
  - Le personnage porte une épée dans la main droite et projette une ombre.
- **4 races jouables** (`src/shared/apparence.ts`) :

  | Race | Devise | Particularités |
  |---|---|---|
  | **Humains** | les bâtisseurs de la Clairière | proportions de référence |
  | **Sylvains** | les gardiens des forêts anciennes | grands et fins, oreilles pointues |
  | **Roncenains** | les forgerons des montagnes | petits, trapus, grosses mains, barbe par défaut |
  | **Cendrins** | les enfants de la braise | grands, peau grise, cornes, yeux qui luisent comme des braises |

- **Écran de création** :
  - le personnage est montré en 3D dans la Clairière, il tourne seul, et on peut le faire tourner à la souris ;
  - on choisit le peuple, le corps (homme ou femme), le teint, la coiffure (6 choix), la couleur des cheveux, la barbe et la couleur de la tunique ;
  - un bouton 🎲 tire une apparence au hasard ;
  - le navigateur retient le dernier personnage.
- **Serveur** : chaque joueur a un champ `look`, qui contient l'apparence. Le serveur la vérifie (`nettoyerApparence`) avant de l'accepter. Elle est sauvegardée avec le personnage et suit les voyages entre les zones.
- **Contrôles « à l'ancienne »** : on lit la position des touches, pas la lettre, donc ils marchent en AZERTY comme en QWERTY.

  | Action | AZERTY | QWERTY |
  |---|---|---|
  | Tourner | Q / D | A / D |
  | Pas de côté | A / E | Q / E |
  | Avancer, reculer | Z / S | W / S |

  - Les flèches font aussi tourner. La caméra se replace derrière le personnage.
  - Avec le clic droit maintenu, la souris dirige le personnage, et Q/D (A/D en QWERTY) font des pas de côté.
  - Avec les deux boutons de la souris enfoncés, le personnage avance.
- **Labo** : `labo.html?scene=avatars` montre les 4 races avec le vrai avatar du jeu.

### Vérifié (navigateur sans carte graphique)

- Les 4 races s'affichent dans l'écran de création et en jeu. Deux joueurs voient bien la race l'un de l'autre.
- Les contrôles ont été mesurés :
  - D pendant 1 s fait tourner de 2,6 radians à droite ;
  - Z fait avancer et S reculer, plus lentement ;
  - la caméra revient derrière le personnage.
- L'attaque en pleine course, la mort, la réapparition et le voyage vers la Grotte des Échos fonctionnent, et le voyage garde la race.
- Aucune fuite d'animations ni de maillages, et aucune erreur dans la page.
- Il y a eu une fusion avec le nouveau sol et les ambiances (autre fil), car `game.ts` avait été modifié des deux côtés. Elle a été testée : écran de création, jeu, puis `/ambiance hiver` et `/ambiance cendres`, sans erreur.

### Limites connues

- Les vêtements sont des « coques » générées à partir du corps : une tunique, un pantalon et des bottes. Il n'y a pas encore de vraies pièces d'armure.
- Il n'existe pas d'animation de pas de côté ni de rotation sur place. Ces deux mouvements utilisent la marche.
- **Performances non mesurées** : environ 22 000 triangles et une dizaine d'appels de dessin par personnage. C'est à vérifier sur le Mac avec plusieurs joueurs. `?qualite=basse` retire le relief des textures et les ombres reçues.
- Les noms et les devises des races sont des propositions, et Thierry doit les valider.

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
