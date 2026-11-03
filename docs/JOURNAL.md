# Journal de Cendrelune

Ce fichier garde la trace des décisions et des étapes du projet. Les entrées les plus récentes sont en haut.

## 2026-11-03 : nouveau sol et ambiances de zone

Demande de Thierry : améliorer le sol et créer un système qui permet plusieurs ambiances de zone, plus jolies.

### Décisions

- **Une ambiance = un preset de biome**, décrit dans `src/client/world/biomes.ts` : couleurs du sol, teinte du ciel et de la brume, puissance du soleil, étalonnage de l'image, type d'eau, palettes des arbres, herbes, fleurs, météo et lucioles.
- **Une ambiance est purement visuelle.** Le relief, les chemins et la position des obstacles restent ceux de la zone, partagés avec le serveur. On peut donc changer d'ambiance sans toucher au jeu.
- **Chaque zone choisit son ambiance par défaut** (`ambiance` dans `src/shared/zones.ts`). La Clairière est en « printemps ».
- **Commande d'essai `/ambiance <nom>`** : elle change l'ambiance chez toi seul, sans toucher les autres joueurs. Le choix est retenu par le navigateur. `/ambiance zone` revient à l'ambiance prévue. On peut aussi ouvrir le jeu avec `?ambiance=hiver` dans l'adresse.
- **Le sol est peint par un shader** greffé sur le matériau standard de Babylon (`MaterialPluginBase`), ce qui garde les lumières, les ombres et la brume. Il n'utilise aucune image : tout est calculé en code.

### Ce qui a été fait

- Cinq ambiances : **Printemps de Cendrelune**, **Automne doré**, **Hiver du Nord**, **Marais des Brumes** et **Terres de cendre**.
- Le sol (`terrainMaterial.ts`) :
  - relief lissé, avec un maillage plus fin ;
  - une carte de mélange calculée depuis la zone : chemins, place, prairies sèches, sous-bois ;
  - de l'herbe en plusieurs tons, avec des coups de pinceau ;
  - des chemins de terre avec des ornières et des cailloux ;
  - une place du village pavée, avec de la mousse dans les joints ;
  - de la roche striée et fissurée sur les pentes ;
  - du sable ridé, un sol mouillé et un fond de lac ;
  - de la neige avec des congères et du givre qui scintille ;
  - des braises dans les fissures, pour les Terres de cendre.
- L'eau a quatre modes :
  - **eau claire** ;
  - **glace**, sur laquelle on marche ;
  - **vase**, avec des nénuphars ;
  - **croûte de braises**, sur laquelle on marche aussi.
- Une correction de couleur de l'eau : elle paraissait délavée, faute de conversion gamma vers linéaire. Elle s'assombrit maintenant la nuit.
- La végétation :
  - des herbes plus denses, en dégradé, qui ondulent au vent ;
  - des fleurs qui brillent la nuit dans le Marais et les Terres de cendre ;
  - des cerisiers en fleurs, des feuillus d'automne et des arbres nus ;
  - de la neige sur les sapins, les toits, les rochers et le puits.
- La météo suit la caméra : pollen, feuilles mortes, neige, nappes de brume, cendres et braises.
- L'étalonnage de l'image (exposition, contraste, saturation, teinte) change avec l'ambiance.
- Des captures sont dans `docs/captures/ambiances/`.

### Créer une nouvelle ambiance

1. Copier un preset dans `biomes.ts` et changer son `id`, son nom et ses couleurs.
2. L'ajouter à `BIOMES`.
3. Elle est aussitôt disponible avec `/ambiance <id>`. Pour en faire l'ambiance d'une zone, mettre son id dans le champ `ambiance` de la zone.

### Limites et suites possibles

- La mini-carte garde ses couleurs de printemps.
- Le donjon n'utilise pas encore le nouveau shader de sol. On pourrait y faire un preset « caverne » : dalles, mousse, veines de cristal.
- Les ambiances ne décident pas encore des monstres, des sons ou de la musique.
- Les captures ont été faites dans un navigateur sans carte graphique (rendu logiciel). Les performances réelles restent à vérifier sur le Mac. `?qualite=basse` allège la densité d'herbe, la météo et la résolution du sol.

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
