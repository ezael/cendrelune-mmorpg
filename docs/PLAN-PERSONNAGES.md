# Cendrelune : plan pour le design des personnages et des races

*Proposition du 3 novembre 2026. Rien n'est codé tant que Thierry n'a pas validé.*

## 1. Le constat

Les personnages actuels (`src/client/entities/character.ts`) sont des assemblages de capsules, de sphères et de boîtes, sans squelette : chaque membre pivote d'un bloc. C'est pour ça qu'ils font « cube » ou « jouet » :

- aucune déformation aux articulations (coudes, genoux, épaules) ;
- des mains et des pieds faits de simples boîtes, et un visage réduit à deux points ;
- des animations calculées à la main et donc raides ;
- un seul gabarit, ce qui empêche de faire de vraies races.

## 2. Les options techniques

| Option | Principe | Avantages | Inconvénients |
|---|---|---|---|
| **A. Code amélioré** | Continuer à générer les personnages en code, en plus organique | Aucun fichier externe | Sans maillage déformable ni vrai rig, le résultat restera « jouet ». Beaucoup de travail pour un gain limité |
| **B. Base humanoïde CC0 + races dérivées** *(recommandée)* | Un corps de base rigué, de bonne qualité, et chaque race obtenue par proportions, pièces ajoutées (oreilles, barbe, cornes…) et couleurs | Rendu nettement plus joli tout de suite. Une seule bibliothèque d'animations sert à toutes les races. Gratuit, usage commercial autorisé | Environ 13 000 triangles par personnage, à surveiller quand il y a du monde. Style plus « réaliste stylisé » que l'actuel |
| **C. Personnages tout faits (KayKit)** | Personnages chibi déjà animés | Très rapide | Seulement 5 personnages gratuits, aux corps figés, donc pas de vraies races et peu de personnalisation |

### Ce que j'ai vérifié pour l'option B

- [Quaternius, *Universal Base Characters*](https://quaternius.com/packs/universalbasecharacters.html) : licence **CC0**. Le pack contient 6 corps (proportions héroïque, normale et ado, chacune en homme et en femme), **20 coiffures**, un rig humanoïde prévu pour le reciblage, environ 13 000 triangles en moyenne, et des fichiers glTF et FBX.
- [Quaternius, *Universal Animation Library*](https://quaternius.itch.io/universal-animation-library) : licence **CC0**. Plus de 120 animations sur le même rig, compatibles Mixamo. La page ne dit pas combien d'animations contient la version gratuite : **je dois le vérifier en téléchargeant le pack**.
- [Babylon.js, reciblage d'animations](https://doc.babylonjs.com/features/featuresDeepDive/animation/animationRetargeting) : la classe `AnimatorAvatar.retargetAnimationGroup` existe depuis **Babylon 9.0**, et le projet est en 9.33. Elle applique une animation à un squelette aux proportions différentes et corrige le contact des pieds avec le sol. C'est exactement ce qu'il faut pour qu'un nain et un grand elfe partagent les mêmes animations.
- [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) (option C) : licence CC0, 5 personnages gratuits, 3 de plus dans la version payante.

**Ce que je n'ai pas encore testé** : le chargement réel de ces fichiers dans notre client, ni ce que coûtent 20 à 50 personnages animés à l'écran. C'est l'objet de l'étape 0.

## 3. Les races proposées

Ce sont des archétypes de fantasy classiques, réinterprétés pour Cendrelune (un monde de cendres et de lune). Les noms sont des propositions, à changer librement.

| Race | Silhouette | Signes distinctifs | Idée d'origine |
|---|---|---|---|
| **Humains** | Normale | Variété de teints et de coiffures | Le village de la Clairière |
| **Sylvains** (elfes) | Grande, élancée | Oreilles pointues, teint pâle ou cuivré | Les forêts anciennes |
| **Roncenains** (nains) | Petite, trapue, large | Barbes tressées, mains et pieds larges | Les montagnes et les mines |
| **Pieds-Légers** (petites gens) | Petite, menue | Grands yeux, cheveux bouclés | Les collines et les fermes |
| **Cendrins** | Grande, massive | Peau gris cendre ou ardoise, petites cornes, yeux luisants | Peuple né des cendres, au cœur du lore |
| **Lunaires** *(option)* | Normale, fine | Peau bleutée, marques lumineuses qui brillent la nuit | Liés à la lune ; ils profitent du cycle jour/nuit |

Pour la v1, je propose **4 races** : Humains, Sylvains, Roncenains et Cendrins. Elles donnent quatre silhouettes bien distinctes. Les autres viendront ensuite.

Côté game design (pour plus tard) : de petits bonus raciaux, une ville de départ par race et une vision nocturne pour certaines, à la manière des MMO old-school.

## 4. La personnalisation (écran de création)

- **Race** et **corps** (homme ou femme).
- **Teint de peau** : une palette propre à chaque race.
- **Coiffure** (parmi les 20 du pack) et **couleur de cheveux**.
- **Pilosité** : barbe et moustache, surtout pour les Roncenains et les Humains.
- **Couleur des yeux**.
- **Taille** : un curseur limité à ±5 % autour de la taille de la race.
- **Signe racial** : forme des oreilles, des cornes ou des marques, selon la race.
- **Couleur de la tenue de départ** (comme aujourd'hui).

L'équipement visible (armures, armes portées) reste une étape à part, qui ne fait pas partie de ce plan.

## 5. Les étapes

0. **Essai technique** : charger un corps de base et 3 animations dans le client, les recibler sur un corps aux proportions de nain, puis mesurer les performances avec 30 personnages. **Je vous envoie des captures, et vous validez ou non le rendu avant d'aller plus loin.**
1. **Intégration** : un chargeur de personnages avec cache et clonage, et une machine à états d'animation qui remplace l'animation codée à la main (repos, marche, course, saut, attaque, sort, salut, assis, mort). Les étiquettes de nom, les bulles de chat et le ciblage continuent de marcher.
2. **Races** : proportions de chaque race, pièces ajoutées (oreilles, barbes, cornes) générées en code ou en script Blender, et palettes de couleurs. Captures à valider.
3. **Écran de création du personnage** : choix de la race et des options, avec aperçu en 3D qui tourne.
4. **Serveur** : ajout de la race et de l'apparence au personnage, puis synchronisation entre les joueurs.
5. **Finitions** : version légère des personnages pour le mode `?qualite=basse` (niveaux de détail), ombrage stylisé cohérent avec le décor, puis mise à jour du journal et ouverture d'une PR.

## 6. Ce que j'attends de vous

1. Valider l'**option B**, ou en choisir une autre.
2. Valider la **liste des races** pour la v1, avec les noms qui vous plaisent.
3. Choisir le **style** : des proportions « réalistes stylisées » (le style des packs), ou plus « cartoon », avec une tête plus grosse, ce qui reste faisable par mise à l'échelle.
