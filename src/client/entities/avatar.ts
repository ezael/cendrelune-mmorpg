/**
 * Personnage joueur basé sur les modèles CC0 de Quaternius, style « intermédiaire » (B).
 *
 * - Corps rigué (65 os) + coiffure / barbe sur le même squelette.
 * - Races : proportions par os + pièces ajoutées (oreilles, cornes) + palettes.
 * - Vêtements en volume (coques découpées dans le corps, voir labo/personnage-cc0.ts).
 * - Animations en deux couches (bas du corps / haut du corps) avec fondus :
 *   on peut frapper ou lancer un sort en courant.
 *
 * Même interface publique que l'ancien `Character`, pour que le jeu n'ait presque rien à changer.
 */
import {
  AnimationGroup, Color3, Mesh, MeshBuilder, PBRMaterial, Path3D, Quaternion, Scene, Skeleton, TransformNode, Vector3, VertexBuffer,
  type AbstractMesh, type CascadedShadowGenerator, type ShadowGenerator,
} from "@babylonjs/core";
import { RACES, nettoyerApparence, type Apparence } from "../../shared/apparence.js";
import { TenuePlugin, chargerBibliotheque, coque, type Corps } from "../labo/personnage-cc0.js";
import { LOW_QUALITY } from "../quality.js";

export interface AnimInput {
  /** vitesse horizontale réelle, en m/s */
  speed: number;
  airborne: boolean;
  /** 0 repos, 1 marche, 2 course, 3 saut, 4 salut, 5 assis */
  anim: number;
  dead: boolean;
  /** recule (anime la marche à l'envers) */
  backward?: boolean;
  /** tourne sur place */
  turning?: boolean;
}

type Lib = Awaited<ReturnType<typeof chargerBibliotheque>>;
const libs = new WeakMap<Scene, Lib>();

const SOURCES = {
  repos: "Idle_Loop",
  marche: "Walk_Loop",
  course: "Jog_Fwd_Loop",
  sprint: "Sprint_Loop",
  saut: "Jump_Loop",
  assis: "Sitting_Idle_Loop",
  salut: "Idle_Talking_Loop",
  mort: "Death01",
  attaque: "Sword_Attack",
  sort: "Spell_Simple_Shoot",
  coup: "Hit_Chest",
} as const;
type AnimId = keyof typeof SOURCES;
const UNE_FOIS: AnimId[] = ["mort", "attaque", "sort", "coup"];

/** Vitesse « naturelle » des cycles de marche (mesurée sur la version à déplacement racine). */
const VITESSE_NATIVE: Partial<Record<AnimId, number>> = { marche: 0.97, course: 5.36, sprint: 8.25 };

/** Os du bas du corps ; tout le reste (colonne, bras, tête) est le haut. */
const BAS = new Set(["root", "pelvis", "thigh_l", "calf_l", "foot_l", "ball_l", "ball_leaf_l", "thigh_r", "calf_r", "foot_r", "ball_r", "ball_leaf_r"]);

const PANTALONS: Record<string, string> = { humain: "#3f342b", sylvain: "#4a4636", roncenain: "#3a3530", cendrin: "#2e2c30" };
const BOTTES: Record<string, string> = { humain: "#3b2a1e", sylvain: "#4a3a28", roncenain: "#2a2018", cendrin: "#221c1a" };
const CEINTURES: Record<string, string> = { humain: "#5a3a22", sylvain: "#6b5a32", roncenain: "#8a6a2a", cendrin: "#3a2a22" };

/** Couche d'animation : fondus enchaînés entre plusieurs groupes. */
class Couche {
  private poids = new Map<AnimId, number>();
  courant: AnimId | null = null;
  private finUneFois: (() => void) | null = null;

  constructor(private groupes: Map<AnimId, AnimationGroup>) {}

  jouer(id: AnimId, vitesse = 1, depuisDebut = false) {
    const g = this.groupes.get(id);
    if (!g) return;
    if (this.courant !== id || depuisDebut) {
      const boucle = !UNE_FOIS.includes(id);
      if (!g.isPlaying || depuisDebut) {
        g.stop();
        g.start(boucle, vitesse, g.from, g.to);
        g.weight = this.poids.get(id) ?? 0;
        if (!boucle) {
          g.onAnimationGroupEndObservable.addOnce(() => {
            // reste figé sur la dernière image (mort) ou rend la main (coups, sorts)
            if (id === "mort") g.goToFrame(g.to);
            this.finUneFois?.();
          });
        }
      }
      this.courant = id;
      if (!this.poids.has(id)) this.poids.set(id, 0);
    }
    g.speedRatio = vitesse;
  }

  /** callback appelé à la fin d'une animation jouée une seule fois */
  surFin(f: (() => void) | null) { this.finUneFois = f; }

  update(dt: number) {
    const k = Math.min(1, dt * 9);
    for (const [id, w] of this.poids) {
      const cible = id === this.courant ? 1 : 0;
      const nw = w + (cible - w) * k;
      const g = this.groupes.get(id)!;
      if (cible === 0 && nw < 0.01) {
        this.poids.delete(id);
        if (id !== "mort") g.stop();
        g.weight = 0;
        continue;
      }
      this.poids.set(id, nw);
      g.weight = nw;
    }
  }
}

let compteur = 0;

export class Avatar {
  readonly root: TransformNode;
  readonly headAnchor: TransformNode;
  readonly meshes: AbstractMesh[] = [];
  readonly apparence: Apparence;
  private bones = new Map<string, TransformNode>();
  private skeleton!: Skeleton;
  private bas: Couche;
  private haut: Couche;
  private surcouche: AnimId | null = null;
  private yaw = 0;
  private decalageY = 0;
  private taille = 1;
  private materials: PBRMaterial[] = [];
  private groupes: AnimationGroup[] = [];

  /** Charge les modèles et les animations (à attendre une fois avant de créer des avatars). */
  static async precharger(scene: Scene): Promise<void> {
    if (libs.has(scene)) return;
    libs.set(scene, await chargerBibliotheque(scene));
  }

  constructor(private scene: Scene, readonly name: string, look: Apparence | string, opts: { pickId?: string } = {}) {
    const lib = libs.get(scene);
    if (!lib) throw new Error("Avatar.precharger() doit être appelé avant de créer un avatar");
    this.apparence = typeof look === "string" ? nettoyerApparence(look) : look;
    const a = this.apparence;
    const race = RACES[a.race];
    const id = `av${++compteur}`;
    this.root = new TransformNode(`avatar_${name}`, scene);
    const prefix = (n: string) => `${id}_${n}`;

    // --- Corps -------------------------------------------------------------
    const corps: Corps = a.corps;
    const body = lib.corps[corps].instantiateModelsToScene(prefix, true, { doNotInstantiate: true });
    const bodyRoot = body.rootNodes[0] as TransformNode;
    bodyRoot.parent = this.root;
    this.skeleton = body.skeletons[0];
    for (const tn of bodyRoot.getDescendants(false)) {
      if (tn instanceof TransformNode && !(tn instanceof Mesh)) this.bones.set(tn.name.slice(prefix("").length), tn);
    }
    const H = corps === "homme" ? 1.81 : 1.767;
    const peau = Color3.FromHexString(race.peaux[a.peau]);
    const cheveux = Color3.FromHexString(race.cheveux[a.cheveux]);
    // textures de cheveux grises (≈ 142/255, soit 0,27 en linéaire) : on les teinte
    const teinteCheveux = cheveux.toLinearSpace().scale(0.82 / 0.27);

    let peauMat: PBRMaterial | null = null;
    for (const m of bodyRoot.getChildMeshes(false)) {
      this.meshes.push(m);
      const src = m.material as PBRMaterial | null;
      if (!src) continue;
      const mat = src.clone(`${id}_${src.name}`) as PBRMaterial;
      this.materials.push(mat);
      m.material = mat;
      mat.metallic = 0;
      mat.metallicTexture = null;
      mat.roughness = 0.8;
      if (mat.bumpTexture) mat.bumpTexture.level = 0.35;
      if (LOW_QUALITY) mat.bumpTexture = null; // mode qualité basse : pas de carte de relief
      if (/Superhero/i.test(src.name)) {
        peauMat = mat;
        const plug = new TenuePlugin(mat);
        plug.hauteur = H;
        plug.tunique = Color3.FromHexString(a.tenue);
        plug.pantalon = Color3.FromHexString(PANTALONS[a.race]);
        plug.bottes = Color3.FromHexString(BOTTES[a.race]);
        plug.ceinture = Color3.FromHexString(CEINTURES[a.race]);
        plug.paliers = 6;
        plug.forceToon = 0.3;
        // recolore la texture de peau (teinte moyenne ≈ rgb(163,116,82)) vers la peau choisie
        const moy = new Color3(163 / 255, 116 / 255, 82 / 255).toLinearSpace();
        const c = peau.toLinearSpace();
        mat.albedoColor = new Color3(c.r / moy.r, c.g / moy.g, c.b / moy.b);
        // vêtements en volume
        for (const cle of ["bottes", "pantalon", "tunique"] as const) {
          const v = new Mesh(`${id}_${cle}`, scene);
          coque(m as Mesh, H, cle, corps).applyToMesh(v);
          v.parent = m.parent;
          v.position.copyFrom(m.position);
          v.rotationQuaternion = m.rotationQuaternion?.clone() ?? null;
          v.scaling.copyFrom(m.scaling);
          v.skeleton = this.skeleton;
          v.numBoneInfluencers = (m as Mesh).numBoneInfluencers;
          const vm = new PBRMaterial(`${id}_${cle}_mat`, scene);
          vm.metallic = 0;
          vm.roughness = cle === "bottes" ? 0.6 : 0.95;
          vm.metallicF0Factor = cle === "bottes" ? 0.5 : 0.15;
          const col = cle === "tunique" ? a.tenue : cle === "pantalon" ? PANTALONS[a.race] : BOTTES[a.race];
          vm.albedoColor = Color3.FromHexString(col).toLinearSpace();
          const vp = new TenuePlugin(vm);
          vp.zones = false;
          vp.ceintureSeule = cle === "tunique";
          vp.hauteur = H;
          vp.ceinture = Color3.FromHexString(CEINTURES[a.race]);
          vp.paliers = 6;
          vp.forceToon = 0.3;
          v.material = vm;
          this.materials.push(vm);
          this.meshes.push(v);
        }
      } else if (/Hair/i.test(src.name)) {
        mat.albedoColor = teinteCheveux; // sourcils
      } else if (/Eye/i.test(src.name) && race.yeuxLuisants) {
        mat.emissiveColor = Color3.FromHexString(race.yeuxLuisants);
        mat.albedoColor = Color3.FromHexString(race.yeuxLuisants);
      }
    }

    // --- Coiffure et barbe (même squelette, mêmes os) --------------------------
    const pieces: string[] = [];
    if (a.coiffure !== "aucune") pieces.push(a.coiffure);
    if (a.barbe) pieces.push("Hair_Beard");
    for (const piece of pieces) {
      const inst = lib.pieces[piece].instantiateModelsToScene(prefix, true, { doNotInstantiate: true });
      for (const m of inst.rootNodes[0].getChildMeshes(false)) {
        const mesh = m as Mesh;
        mesh.skeleton = this.skeleton;
        mesh.parent = bodyRoot;
        const src = mesh.material as PBRMaterial;
        const mat = src.clone(`${id}_${piece}`) as PBRMaterial;
        mat.albedoColor = teinteCheveux;
        mat.metallic = 0;
        mat.roughness = 0.75;
        if (mat.bumpTexture) mat.bumpTexture.level = 0.35;
        mesh.material = mat;
        this.materials.push(mat);
        this.meshes.push(mesh);
      }
      inst.rootNodes[0].dispose(false, false);
      for (const s of inst.skeletons) s.dispose();
    }

    // --- Pièces raciales et épée, posées en pose de repos puis attachées aux os -------
    this.root.computeWorldMatrix(true);
    for (const b of this.bones.values()) b.computeWorldMatrix(true);
    const tete = this.bones.get("Head")!;
    const yHaut = H; // sommet du crâne
    const peauLisse = new PBRMaterial(`${id}_peau_lisse`, scene);
    peauLisse.metallic = 0;
    peauLisse.roughness = 0.75;
    peauLisse.albedoColor = peau.toLinearSpace();
    this.materials.push(peauLisse);

    if (race.oreilles) {
      for (const side of [-1, 1]) {
        const ear = MeshBuilder.CreateCylinder(`${id}_oreille`, { height: 0.15, diameterTop: 0, diameterBottom: 0.055, tessellation: 10 }, scene);
        ear.scaling.set(1, 1, 0.32);
        const dir = new Vector3(side * 0.82, 0.5, -0.28).normalize();
        ear.position = new Vector3(side * 0.07, yHaut - 0.15, -0.012).add(dir.scale(0.06));
        // oriente l'axe Y du cône le long de `dir`
        ear.rotationQuaternion = quatDepuisY(dir);
        ear.material = peauLisse;
        ear.setParent(tete);
        this.meshes.push(ear);
      }
    }
    if (race.cornes) {
      const corne = new PBRMaterial(`${id}_corne`, scene);
      corne.metallic = 0;
      corne.roughness = 0.45;
      corne.albedoColor = Color3.FromHexString("#2a2422").toLinearSpace();
      corne.emissiveColor = Color3.FromHexString("#1e0904");
      this.materials.push(corne);
      for (const side of [-1, 1]) {
        const base = new Vector3(side * 0.05, yHaut - 0.045, 0.045);
        const pts = [
          base,
          base.add(new Vector3(side * 0.015, 0.045, -0.01)),
          base.add(new Vector3(side * 0.035, 0.085, -0.05)),
          base.add(new Vector3(side * 0.045, 0.105, -0.105)),
          base.add(new Vector3(side * 0.04, 0.1, -0.16)),
        ];
        const path = new Path3D(pts).getCurve();
        const tube = MeshBuilder.CreateTube(`${id}_corne`, {
          path: lisser(path, 4), tessellation: 10, cap: Mesh.CAP_START,
          radiusFunction: (i) => 0.024 * (1 - i / 16) + 0.002,
        }, scene);
        tube.material = corne;
        tube.setParent(tete);
        this.meshes.push(tube);
      }
    }

    // Épée dans la main droite (la même animation d'attaque sert à toutes les races).
    const main = this.bones.get("hand_r")!;
    const epee = this.construireEpee(id);
    const pm = main.getAbsolutePosition();
    const out = Math.sign(pm.x) || 1;
    epee.position = pm.add(new Vector3(out * 0.08, -0.025, 0.0));
    epee.rotationQuaternion = quatDepuisY(new Vector3(0, 0.15, 1).normalize());
    // nœud intermédiaire qui annule l'échelle de la main (sinon l'épée serait déformée)
    const porte = new TransformNode(`${id}_porte_epee`, scene);
    porte.parent = main;
    epee.setParent(porte);

    // --- Proportions (race) ------------------------------------------------------------
    const pr = { ...race.proportions };
    pr.tete *= 1.14; // style B : tête un peu plus grosse
    pr.mains *= 1.05;
    pr.largeur *= 1.03;
    this.taille = pr.taille;
    this.root.scaling.setAll(pr.taille);
    const set = (n: string, v: Vector3) => this.bones.get(n)?.scaling.copyFrom(v);
    const w = pr.largeur;
    set("pelvis", new Vector3(w, 1, w));
    set("neck_01", new Vector3(1 / w, 1, 1 / w));
    set("Head", new Vector3(pr.tete * Math.min(1.1, w), pr.tete, pr.tete * Math.min(1.1, w)));
    for (const s of ["l", "r"]) {
      set(`upperarm_${s}`, new Vector3(1, pr.bras, 1));
      set(`hand_${s}`, new Vector3(pr.mains / w, pr.mains / pr.bras, pr.mains / w));
      set(`thigh_${s}`, new Vector3(1, pr.jambes, 1));
      set(`foot_${s}`, new Vector3(1.1 / w, 1 / pr.jambes, 1.1 / w));
    }
    this.decalageY = -(1 - pr.jambes) * 0.93 * pr.taille;
    const hs = main.scaling;
    porte.scaling.set(1 / hs.x, 1 / hs.y, 1 / hs.z);

    // --- Animations : deux couches ----------------------------------------------------------
    const basG = new Map<AnimId, AnimationGroup>();
    const hautG = new Map<AnimId, AnimationGroup>();
    for (const [cle, nom] of Object.entries(SOURCES) as Array<[AnimId, string]>) {
      const src = lib.anims.animationGroups.find((g) => g.name === nom);
      if (!src) continue;
      const gb = new AnimationGroup(`${id}_${cle}_bas`, scene);
      const gh = new AnimationGroup(`${id}_${cle}_haut`, scene);
      for (const ta of src.targetedAnimations) {
        const target = this.bones.get(ta.target.name);
        if (!target) continue;
        const prop = ta.animation.targetProperty;
        if (prop === "scaling") continue;
        if (prop === "position" && ta.target.name !== "pelvis") continue;
        (BAS.has(ta.target.name) ? gb : gh).addTargetedAnimation(ta.animation, target);
      }
      gb.normalize(src.from, src.to);
      gh.normalize(src.from, src.to);
      basG.set(cle, gb);
      hautG.set(cle, gh);
    }
    this.groupes = [...basG.values(), ...hautG.values()];
    this.bas = new Couche(basG);
    this.haut = new Couche(hautG);
    this.haut.surFin(() => { this.surcouche = null; });
    this.bas.jouer("repos");
    this.haut.jouer("repos");

    // --- Rendu, ombres, ciblage ----------------------------------------------------------
    for (const m of this.meshes) {
      m.receiveShadows = !LOW_QUALITY;
      m.metadata = opts.pickId ? { pickId: opts.pickId } : undefined;
      m.isPickable = !!opts.pickId;
      m.alwaysSelectAsActiveMesh = false;
    }
    this.headAnchor = new TransformNode(`${id}_headAnchor`, scene);
    this.headAnchor.parent = this.root;
    this.headAnchor.position.y = (H * pr.taille + 0.28) / pr.taille + this.decalageY / pr.taille;
    void peauMat;
  }

  /** Épée simple : un seul maillage (couleurs par sommet) et un seul matériau, soit un seul appel de dessin. */
  private construireEpee(id: string): TransformNode {
    const scene = this.scene;
    const n = new TransformNode(`${id}_epee`, scene);
    const peint = (m: Mesh, hexa: string) => {
      const c = Color3.FromHexString(hexa).toLinearSpace();
      const nb = m.getTotalVertices();
      const cols: number[] = [];
      for (let i = 0; i < nb; i++) cols.push(c.r, c.g, c.b, 1);
      m.setVerticesData(VertexBuffer.ColorKind, cols);
      return m;
    };
    const grip = peint(MeshBuilder.CreateCylinder(`${id}_grip`, { height: 0.15, diameter: 0.026, tessellation: 8 }, scene), "#4a3020");
    const pommeau = peint(MeshBuilder.CreateSphere(`${id}_pommeau`, { diameter: 0.038, segments: 6 }, scene), "#c9a54a");
    pommeau.position.y = -0.085;
    const garde = peint(MeshBuilder.CreateBox(`${id}_garde`, { width: 0.13, height: 0.022, depth: 0.03 }, scene), "#c9a54a");
    garde.position.y = 0.085;
    const lame = peint(MeshBuilder.CreateBox(`${id}_lame`, { width: 0.034, height: 0.62, depth: 0.008 }, scene), "#e2e7ef");
    lame.position.y = 0.41;
    const pointe = peint(MeshBuilder.CreateCylinder(`${id}_pointe`, { height: 0.07, diameterTop: 0, diameterBottom: 0.034, tessellation: 4 }, scene), "#e2e7ef");
    pointe.scaling.z = 0.24;
    pointe.rotation.y = Math.PI / 4;
    pointe.position.y = 0.755;
    const epee = Mesh.MergeMeshes([grip, pommeau, garde, lame, pointe], true, true)!;
    epee.name = `${id}_epee_m`;
    const mat = new PBRMaterial(`${id}_epee_mat`, scene);
    // pas de carte d'environnement dans les zones : un métal « pur » paraîtrait noir
    mat.metallic = 0.25;
    mat.roughness = 0.32;
    mat.albedoColor = Color3.White();
    mat.emissiveColor = Color3.FromHexString("#14161a");
    epee.material = mat;
    epee.parent = n;
    this.materials.push(mat);
    this.meshes.push(epee);
    return n;
  }

  addToShadows(gen: ShadowGenerator | CascadedShadowGenerator | null) {
    if (!gen) return;
    for (const m of this.meshes) gen.addShadowCaster(m, false);
  }

  attack() { this.jouerSurcouche("attaque", 1.6); }
  cast() { this.jouerSurcouche("sort", 0.9); }
  hurt() { if (!this.surcouche) this.jouerSurcouche("coup", 1.2); }

  private jouerSurcouche(id: AnimId, vitesse: number) {
    if (this.mort) return;
    this.surcouche = id;
    this.haut.jouer(id, vitesse, true);
  }

  private mort = false;

  setPosition(x: number, y: number, z: number) {
    this.root.position.set(x, y + this.decalageY, z);
  }

  /** Oriente le personnage en douceur vers un angle. */
  face(yaw: number, dt: number, instant = false) {
    let d = yaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += instant ? d : d * Math.min(1, dt * 12);
    this.root.rotation.y = this.yaw;
  }

  get facing(): number {
    return this.yaw;
  }

  update(dt: number, s: AnimInput) {
    // Choix de l'animation du bas du corps (locomotion)
    let id: AnimId = "repos";
    let vitesse = 1;
    const v = s.speed / this.taille;
    if (s.dead) id = "mort";
    else if (s.airborne || s.anim === 3) id = "saut";
    else if (s.speed > 6.2) { id = "sprint"; vitesse = clamp(v / VITESSE_NATIVE.sprint!, 0.7, 1.4); }
    else if (s.speed > 1.8) { id = "course"; vitesse = clamp(v / VITESSE_NATIVE.course!, 0.55, 1.4); }
    else if (s.speed > 0.3) { id = "marche"; vitesse = clamp(v / VITESSE_NATIVE.marche!, 0.6, 1.8); }
    else if (s.turning) { id = "marche"; vitesse = 0.75; }
    else if (s.anim === 5) id = "assis";
    else if (s.anim === 4) id = "salut";
    if (s.backward && (id === "marche" || id === "course")) vitesse = -vitesse;

    if (s.dead !== this.mort) {
      this.mort = s.dead;
      if (s.dead) this.surcouche = null;
      this.bas.jouer(id, vitesse, true);
      this.haut.jouer(id, vitesse, true);
    }
    this.bas.jouer(id, vitesse);
    if (!this.surcouche) this.haut.jouer(id, vitesse);
    this.bas.update(dt);
    this.haut.update(dt);
  }

  dispose() {
    for (const g of this.groupes) g.dispose();
    this.skeleton.dispose();
    for (const m of this.materials) m.dispose(true, false);
    this.root.dispose(false, false);
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/** Rotation qui amène l'axe Y local sur la direction donnée. */
function quatDepuisY(dir: Vector3): Quaternion {
  const axis = Vector3.Cross(Vector3.Up(), dir);
  if (axis.lengthSquared() < 1e-8) return Quaternion.Identity();
  const angle = Math.acos(clamp(Vector3.Dot(Vector3.Up(), dir), -1, 1));
  return Quaternion.RotationAxis(axis.normalize(), angle);
}

/** Rééchantillonne une courbe pour un tube bien lisse. */
function lisser(pts: Vector3[], n: number): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < n; j++) out.push(Vector3.Lerp(pts[i], pts[i + 1], j / n));
  }
  out.push(pts[pts.length - 1]);
  return out;
}
