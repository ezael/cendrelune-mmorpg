/**
 * LABO : personnages basés sur les modèles CC0 de Quaternius
 * (Universal Base Characters + Universal Animation Library, version Standard gratuite).
 *
 * - Un corps rigué (65 os), cheveux/sourcils/barbe sur le même squelette.
 * - Les animations de la bibliothèque partagent exactement les mêmes noms d'os :
 *   on les rejoue directement, en ne gardant que les rotations (et la translation
 *   du bassin), ce qui permet de changer librement les proportions (races).
 * - Les vêtements sont PEINTS par un shader d'après la position de repos des sommets
 *   (tunique, pantalon, ceinture, bottes) : c'est un substitut pour l'essai.
 */
import {
  VertexBuffer, VertexData,
  AnimationGroup, AssetContainer, Color3, LoadAssetContainerAsync, MaterialPluginBase, Mesh, PBRMaterial,
  Scene, Skeleton, TransformNode, Vector3, type AbstractMesh, type Material,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF/2.0/index.js";

const BASE = "/assets/characters/";

// ---------------------------------------------------------------------------
// Vêtements peints (plugin de matériau PBR)
// ---------------------------------------------------------------------------

export interface Tenue {
  tunique: string;
  pantalon: string;
  bottes: string;
  ceinture: string;
}

class TenuePlugin extends MaterialPluginBase {
  tunique = Color3.FromHexString("#8c2a2a");
  pantalon = Color3.FromHexString("#4a3a2e");
  bottes = Color3.FromHexString("#3b2a1e");
  ceinture = Color3.FromHexString("#5a3a22");
  /** hauteur du modèle au repos (m) */
  hauteur = 1.81;
  /** 0 = rendu PBR normal ; n > 0 = ombrage en n paliers (cel shading). */
  paliers = 0;
  /** force du cel shading (0..1) */
  forceToon = 0.75;
  /** peindre les zones de vêtements (faux si le maillage EST un vêtement) */
  zones = true;
  /** coque de tunique : seulement la ceinture */
  ceintureSeule = false;
  /** remplace la texture de peau par une couleur unie (style stylisé). */
  peauUnie: Color3 | null = null;

  constructor(material: Material) {
    super(material, "Tenue", 200, { TENUE: false });
    this._enable(true);
  }
  getClassName() { return "TenuePlugin"; }
  prepareDefines(defines: Record<string, unknown>) { defines.TENUE = true; }
  getUniforms() {
    return {
      ubo: [
        { name: "tTunique", size: 3, type: "vec3" },
        { name: "tPantalon", size: 3, type: "vec3" },
        { name: "tBottes", size: 3, type: "vec3" },
        { name: "tCeinture", size: 3, type: "vec3" },
        { name: "tPeau", size: 4, type: "vec4" },
        { name: "tParams", size: 4, type: "vec4" },
      ],
    };
  }
  bindForSubMesh(ubo: { updateColor3(n: string, c: Color3): void; updateFloat4(n: string, a: number, b: number, c: number, d: number): void; updateFloat2?(n: string, a: number, b: number): void }) {
    ubo.updateColor3("tTunique", this.tunique);
    ubo.updateColor3("tPantalon", this.pantalon);
    ubo.updateColor3("tBottes", this.bottes);
    ubo.updateColor3("tCeinture", this.ceinture);
    const p = this.peauUnie;
    ubo.updateFloat4("tPeau", p ? p.r : 0, p ? p.g : 0, p ? p.b : 0, p ? 1 : 0);
    ubo.updateFloat4("tParams", this.hauteur, this.paliers, this.ceintureSeule ? 2 : this.zones ? 1 : 0, this.forceToon);
  }
  getCustomCode(shaderType: string): { [p: string]: string } {
    if (shaderType === "vertex") {
      return {
        CUSTOM_VERTEX_DEFINITIONS: "varying vec3 vRepos;",
        CUSTOM_VERTEX_MAIN_BEGIN: "vRepos = position;",
      };
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "varying vec3 vRepos;",
      CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
        {
          float h = vRepos.y / tParams.x;
          float ax = abs(vRepos.x);
          if (tPeau.w > 0.5) surfaceAlbedo = toLinearSpace(tPeau.rgb);
          // coque de tunique : on y peint la ceinture
          if (tParams.z > 1.5 && h > 0.528 && h < 0.566) surfaceAlbedo = toLinearSpace(tCeinture);
          vec3 c = vec3(-1.0);
          if (tParams.z > 0.5 && tParams.z < 1.5) {
          // bottes
          if (h < 0.17) c = tBottes;
          // pantalon
          else if (h < 0.535) c = tPantalon;
          // ceinture
          else if (h < 0.565) c = tCeinture;
          // tunique : torse + manches jusqu'au coude (bras en T au repos)
          else if (h < 0.835 && ax < 0.43 * tParams.x / 1.81) c = tTunique;
          // jupe de tunique qui descend sur les cuisses
          if (h > 0.40 && h < 0.535 && ax < 0.21 * tParams.x / 1.81) c = mix(tTunique, tPantalon, 0.25);
          }
          if (c.x >= 0.0) {
            // léger grain de tissu pour éviter l'aplat parfait
            float g = fract(sin(dot(floor(vRepos.xy * 180.0), vec2(12.9898, 78.233))) * 43758.5453);
            surfaceAlbedo = toLinearSpace(c) * (0.94 + 0.08 * g);
          }
        }
      `,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
        if (tParams.y > 0.5) {
          float l = max(dot(finalColor.rgb, vec3(0.299, 0.587, 0.114)), 1e-4);
          float q = (floor(l * tParams.y) + 0.5) / tParams.y;
          finalColor.rgb *= mix(1.0, q / l, tParams.w);
        }
      `,
    };
  }
}

// ---------------------------------------------------------------------------
// Vêtements en volume : « coques » découpées dans le corps et gonflées le long
// des normales. Elles gardent les poids de peau, donc suivent les animations.
// ---------------------------------------------------------------------------

interface Zone { hMin: number; hMax: number; axMax: number }
const ZONES_VET: Record<"tunique" | "pantalon" | "bottes", { zone: Zone; ep: number; evase?: number }> = {
  tunique: { zone: { hMin: 0.44, hMax: 0.84, axMax: 0.42 }, ep: 0.02, evase: 0.06 },
  pantalon: { zone: { hMin: 0.14, hMax: 0.56, axMax: 9 }, ep: 0.011 },
  bottes: { zone: { hMin: -1, hMax: 0.185, axMax: 9 }, ep: 0.024 },
};
const coqueCache = new Map<string, VertexData>();

function coque(body: Mesh, H: number, cle: keyof typeof ZONES_VET, cacheKey: string): VertexData {
  const k = `${cacheKey}_${cle}`;
  const hit = coqueCache.get(k);
  if (hit) return hit;
  const { zone, ep, evase = 0 } = ZONES_VET[cle];
  const pos = body.getVerticesData(VertexBuffer.PositionKind)!;
  const nor = body.getVerticesData(VertexBuffer.NormalKind)!;
  const mi = body.getVerticesData(VertexBuffer.MatricesIndicesKind)!;
  const mw = body.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
  const ind = body.getIndices()!;
  const s = H / 1.81;
  const dedans = (v: number) => {
    const h = pos[v * 3 + 1] / H, ax = Math.abs(pos[v * 3]) / s;
    return h >= zone.hMin && h <= zone.hMax && ax <= zone.axMax;
  };
  // un triangle est gardé s'il touche la zone ; ses sommets extérieurs sont ramenés
  // sur la bordure, ce qui donne des ourlets nets au lieu d'un bord en escalier.
  const keep: number[] = [];
  for (let t = 0; t < ind.length; t += 3) {
    if (dedans(ind[t]) || dedans(ind[t + 1]) || dedans(ind[t + 2])) keep.push(ind[t], ind[t + 1], ind[t + 2]);
  }
  const remap = new Map<number, number>();
  const P: number[] = [], NO: number[] = [], I: number[] = [], W: number[] = [], F: number[] = [];
  for (const v of keep) {
    let n = remap.get(v);
    if (n === undefined) {
      n = remap.size;
      remap.set(v, n);
      let x = pos[v * 3], y = pos[v * 3 + 1];
      y = Math.min(Math.max(y, zone.hMin * H), zone.hMax * H);
      if (Math.abs(x) > zone.axMax * s) x = Math.sign(x) * zone.axMax * s;
      P.push(x, y, pos[v * 3 + 2]);
      NO.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
      for (let j = 0; j < 4; j++) { I.push(mi[v * 4 + j]); W.push(mw[v * 4 + j]); }
    }
    F.push(n);
  }
  // Lissage (Laplacien) : le tissu ne colle pas aux muscles. Les sommets dupliqués
  // aux coutures d'UV sont soudés par position pour éviter les fentes.
  const nv = P.length / 3;
  const weld = new Int32Array(nv);
  const byKey = new Map<string, number>();
  for (let i = 0; i < nv; i++) {
    const key = `${Math.round(P[i * 3] * 2e3)},${Math.round(P[i * 3 + 1] * 2e3)},${Math.round(P[i * 3 + 2] * 2e3)}`;
    const w = byKey.get(key);
    if (w === undefined) { byKey.set(key, i); weld[i] = i; } else weld[i] = w;
  }
  const nb: Array<Set<number>> = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < F.length; t += 3) {
    for (let j = 0; j < 3; j++) {
      const a = weld[F[t + j]], b2 = weld[F[t + ((j + 1) % 3)]];
      nb[a].add(b2); nb[b2].add(a);
    }
  }
  // lissage de Taubin (λ/μ alternés) : lisse sans faire rétrécir le maillage
  const passes = cle === "bottes" ? 12 : 10;
  for (let it = 0; it < passes; it++) {
    const Q = P.slice();
    const f = it % 2 === 0 ? 0.5 : -0.53;
    for (let i = 0; i < nv; i++) {
      if (weld[i] !== i || nb[i].size === 0) continue;
      let ax = 0, ay = 0, az = 0;
      for (const j of nb[i]) { ax += P[j * 3]; ay += P[j * 3 + 1]; az += P[j * 3 + 2]; }
      const c = nb[i].size;
      Q[i * 3] = P[i * 3] + f * (ax / c - P[i * 3]);
      Q[i * 3 + 1] = P[i * 3 + 1] + f * (ay / c - P[i * 3 + 1]);
      Q[i * 3 + 2] = P[i * 3 + 2] + f * (az / c - P[i * 3 + 2]);
    }
    for (let i = 0; i < nv; i++) { const w = weld[i]; Q[i * 3] = Q[w * 3]; Q[i * 3 + 1] = Q[w * 3 + 1]; Q[i * 3 + 2] = Q[w * 3 + 2]; }
    for (let i = 0; i < Q.length; i++) P[i] = Q[i];
  }
  // Normales lissées (moyennées sur les sommets soudés), puis gonflement.
  const N0: number[] = [];
  VertexData.ComputeNormals(P, F, N0);
  const acc = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) for (let j = 0; j < 3; j++) acc[weld[i] * 3 + j] += N0[i * 3 + j];
  const N: number[] = [];
  for (let i = 0; i < nv; i++) {
    const w = weld[i];
    // ComputeNormals suit la convention d'enroulement de Babylon : on s'oriente sur la normale d'origine
    const sgn = acc[w * 3] * NO[i * 3] + acc[w * 3 + 1] * NO[i * 3 + 1] + acc[w * 3 + 2] * NO[i * 3 + 2] < 0 ? -1 : 1;
    const l = (Math.hypot(acc[w * 3], acc[w * 3 + 1], acc[w * 3 + 2]) || 1) * sgn;
    N.push(acc[w * 3] / l, acc[w * 3 + 1] / l, acc[w * 3 + 2] / l);
  }
  for (let i = 0; i < nv; i++) {
    const h = P[i * 3 + 1] / H;
    const flare = evase > 0 && h < 0.56 ? evase * s * Math.min(1, (0.56 - h) / 0.12) : 0;
    const nx = N[i * 3], ny = cle === "bottes" ? Math.max(0, N[i * 3 + 1]) : N[i * 3 + 1], nz = N[i * 3 + 2];
    P[i * 3] += nx * (ep * s + flare);
    P[i * 3 + 1] += ny * ep * s;
    P[i * 3 + 2] += nz * (ep * s + flare);
  }
  // le corps importé est en convention glTF (repère droit) : on inverse l'enroulement
  for (let t = 0; t < F.length; t += 3) { const tmp = F[t + 1]; F[t + 1] = F[t + 2]; F[t + 2] = tmp; }
  const vd = new VertexData();
  vd.positions = P; vd.normals = N; vd.indices = F; vd.matricesIndices = I; vd.matricesWeights = W;
  coqueCache.set(k, vd);
  return vd;
}

// ---------------------------------------------------------------------------
// Chargement (une fois) puis instanciation
// ---------------------------------------------------------------------------

export type Corps = "homme" | "femme";
type Lib = { corps: Record<Corps, AssetContainer>; pieces: Record<string, AssetContainer>; anims: AssetContainer };
const libs = new WeakMap<Scene, Promise<Lib>>();

export const PIECES = ["Hair_SimpleParted", "Hair_Long", "Hair_Buns", "Hair_Buzzed", "Hair_BuzzedFemale", "Hair_Beard", "Eyebrows_Regular", "Eyebrows_Female"] as const;
export type Piece = (typeof PIECES)[number];

export function chargerBibliotheque(scene: Scene): Promise<Lib> {
  let p = libs.get(scene);
  if (!p) {
    p = (async () => {
      const load = (f: string) => LoadAssetContainerAsync(BASE + f, scene);
      const [homme, femme, anims, ...pieces] = await Promise.all([
        load("Superhero_Male_FullBody.gltf"),
        load("Superhero_Female_FullBody.gltf"),
        load("UAL1_Standard.glb"),
        ...PIECES.map((n) => load(`${n}.gltf`)),
      ]);
      return {
        corps: { homme, femme },
        pieces: Object.fromEntries(PIECES.map((n, i) => [n, pieces[i]])),
        anims,
      };
    })();
    libs.set(scene, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Styles et races
// ---------------------------------------------------------------------------

export type Style = "stylise" | "intermediaire" | "semi-realiste";

/** Proportions par os, appliquées après l'animation (échelle locale). */
export interface Proportions {
  taille: number;     // échelle globale
  tete: number;
  mains: number;
  largeur: number;    // élargit le torse (x, z)
  jambes: number;     // longueur des jambes
  bras: number;
}

export const PROPORTIONS: Record<string, Proportions> = {
  humain: { taille: 1, tete: 1, mains: 1, largeur: 1, jambes: 1, bras: 1 },
  nain: { taille: 0.8, tete: 1.12, mains: 1.25, largeur: 1.32, jambes: 0.72, bras: 0.9 },
};

const STYLE_TETE: Record<Style, number> = { stylise: 1.28, intermediaire: 1.14, "semi-realiste": 1 };
function plug0(style: Style) {
  return style === "stylise" ? { paliers: 4, force: 0.75 } : style === "intermediaire" ? { paliers: 6, force: 0.3 } : { paliers: 0, force: 0 };
}

export interface OptionsPerso {
  corps: Corps;
  style: Style;
  race?: keyof typeof PROPORTIONS;
  pieces: Piece[];
  peau: string;          // teinte (style stylisé : couleur unie ; sinon multiplie la texture)
  cheveux: string;
  tenue: Tenue;
}

const ANIMS = {
  repos: "Idle_Loop",
  marche: "Walk_Loop",
  course: "Jog_Fwd_Loop",
  attaque: "Sword_Attack",
  sort: "Spell_Simple_Shoot",
  assis: "Sitting_Idle_Loop",
  mort: "Death01",
  parle: "Idle_Talking_Loop",
} as const;
export type Anim = keyof typeof ANIMS;

export class PersoCC0 {
  readonly root: TransformNode;
  readonly meshes: AbstractMesh[] = [];
  private skeleton!: Skeleton;
  private groups = new Map<Anim, AnimationGroup>();
  private current: AnimationGroup | null = null;
  private bones = new Map<string, TransformNode>();

  private constructor(private scene: Scene, readonly name: string) {
    this.root = new TransformNode(name, scene);
  }

  static async creer(scene: Scene, name: string, o: OptionsPerso): Promise<PersoCC0> {
    const lib = await chargerBibliotheque(scene);
    const p = new PersoCC0(scene, name);
    p.monter(lib, o);
    return p;
  }

  private monter(lib: Lib, o: OptionsPerso) {
    const prefix = (n: string) => `${this.name}_${n}`;
    const body = lib.corps[o.corps].instantiateModelsToScene(prefix, true, { doNotInstantiate: true });
    const bodyRoot = body.rootNodes[0] as TransformNode;
    bodyRoot.parent = this.root;
    this.skeleton = body.skeletons[0];
    for (const tn of bodyRoot.getDescendants(false)) {
      if (tn instanceof TransformNode && !(tn instanceof Mesh)) this.bones.set(tn.name.replace(prefix(""), ""), tn);
    }
    const hauteur = o.corps === "homme" ? 1.81 : 1.767;

    // Matériaux : on clone pour chaque perso (couleurs propres)
    const skin = Color3.FromHexString(o.peau);
    for (const m of bodyRoot.getChildMeshes(false)) {
      this.meshes.push(m);
      const src = m.material as PBRMaterial | null;
      if (!src) continue;
      const mat = src.clone(`${this.name}_${src.name}`) as PBRMaterial;
      m.material = mat;
      const isSkin = /Superhero/i.test(src.name);
      const isBrow = /Hair/i.test(src.name);
      if (isSkin) {
        const plug = new TenuePlugin(mat);
        plug.hauteur = hauteur;
        plug.tunique = Color3.FromHexString(o.tenue.tunique);
        plug.pantalon = Color3.FromHexString(o.tenue.pantalon);
        plug.bottes = Color3.FromHexString(o.tenue.bottes);
        plug.ceinture = Color3.FromHexString(o.tenue.ceinture);
        plug.paliers = plug0(o.style).paliers;
        plug.forceToon = plug0(o.style).force;
        if (o.style === "stylise") plug.peauUnie = skin;
      }
      if (isBrow) mat.albedoColor = Color3.FromHexString(o.cheveux).scale(2.2);
      this.styliser(mat, o.style);
      if (isSkin) {
        // texture de peau claire (la couleur de peau la multiplie)
        // recolore la texture (teinte moyenne ≈ #a3745) vers la couleur de peau choisie, en gardant ses détails
        if (o.style !== "stylise") {
          const moy = new Color3(163 / 255, 116 / 255, 82 / 255).toLinearSpace();
          const cible = skin.toLinearSpace();
          mat.albedoColor = new Color3(cible.r / moy.r, cible.g / moy.g, cible.b / moy.b);
        }
        // vêtements en volume
        for (const cle of ["bottes", "pantalon", "tunique"] as const) {
          const vd = coque(m as Mesh, hauteur, cle, o.corps);
          const v = new Mesh(`${this.name}_${cle}`, this.scene);
          vd.applyToMesh(v);
          v.parent = m.parent;
          v.position.copyFrom(m.position);
          v.rotationQuaternion = m.rotationQuaternion?.clone() ?? null;
          v.scaling.copyFrom(m.scaling);
          v.skeleton = this.skeleton;
          v.numBoneInfluencers = (m as Mesh).numBoneInfluencers;
          const vm = new PBRMaterial(`${this.name}_${cle}_mat`, this.scene);

          vm.metallic = 0;
          vm.roughness = cle === "bottes" ? 0.6 : 0.95;
          vm.metallicF0Factor = cle === "bottes" ? 0.5 : 0.15;
          vm.albedoColor = Color3.FromHexString(o.tenue[cle]).toLinearSpace();
          const vp = new TenuePlugin(vm);
          vp.zones = false;
          vp.ceintureSeule = cle === "tunique";
          vp.hauteur = hauteur;
          vp.ceinture = Color3.FromHexString(o.tenue.ceinture);
          vp.paliers = plug0(o.style).paliers;
          vp.forceToon = plug0(o.style).force;
          v.material = vm;
          v.receiveShadows = true;
          this.meshes.push(v);
        }
      }
    }

    // Pièces (cheveux, barbe, sourcils) : même squelette, mêmes noms d'os → on partage celui du corps.
    for (const piece of o.pieces) {
      const inst = lib.pieces[piece].instantiateModelsToScene(prefix, true, { doNotInstantiate: true });
      for (const m of inst.rootNodes[0].getChildMeshes(false)) {
        const mesh = m as Mesh;
        mesh.skeleton = this.skeleton;
        mesh.parent = bodyRoot;
        const src = mesh.material as PBRMaterial;
        const mat = src.clone(`${this.name}_${src.name}_${piece}`) as PBRMaterial;
        mat.albedoColor = Color3.FromHexString(o.cheveux).scale(2.2);
        this.styliser(mat, o.style);
        mesh.material = mat;
        this.meshes.push(mesh);
      }
      inst.rootNodes[0].dispose(false, false);
      for (const s of inst.skeletons) s.dispose();
    }

    // Animations : clonées sur nos os, rotations seulement (+ translation du bassin).
    for (const [key, animName] of Object.entries(ANIMS) as Array<[Anim, string]>) {
      const src = lib.anims.animationGroups.find((g) => g.name === animName);
      if (!src) continue;
      const g = new AnimationGroup(`${this.name}_${key}`, this.scene);
      for (const ta of src.targetedAnimations) {
        const target = this.bones.get(ta.target.name);
        if (!target) continue;
        const prop = ta.animation.targetProperty;
        if (prop === "scaling") continue;
        if (prop === "position" && ta.target.name !== "pelvis") continue;
        g.addTargetedAnimation(ta.animation, target);
      }
      g.normalize(src.from, src.to);
      this.groups.set(key, g);
    }

    // Proportions (race × style) appliquées après chaque évaluation d'animation.
    const pr = { ...PROPORTIONS[o.race ?? "humain"] };
    pr.tete *= STYLE_TETE[o.style];
    if (o.style === "stylise") { pr.mains *= 1.12; pr.jambes *= 0.94; pr.largeur *= 1.06; }
    if (o.style === "intermediaire") { pr.mains *= 1.05; pr.largeur *= 1.03; }
    this.root.scaling.setAll(pr.taille);
    const set = (n: string, v: Vector3) => this.bones.get(n)?.scaling.copyFrom(v);
    this.scene.onBeforeRenderObservable.add(() => {
      const w = pr.largeur;
      // le bassin élargit tout le corps (torse, bras, jambes) ; on compense au cou, aux mains, aux pieds
      set("pelvis", new Vector3(w, 1, w));
      set("neck_01", new Vector3(1 / w, 1, 1 / w));
      set("Head", new Vector3(pr.tete * Math.min(1.1, w), pr.tete, pr.tete * Math.min(1.1, w)));
      for (const s of ["l", "r"]) {
        set(`upperarm_${s}`, new Vector3(1, pr.bras, 1));
        set(`hand_${s}`, new Vector3(pr.mains / w, pr.mains / pr.bras, pr.mains / w));
        set(`thigh_${s}`, new Vector3(1, pr.jambes, 1));
        set(`foot_${s}`, new Vector3(1.1 / w, 1 / pr.jambes, 1.1 / w));
      }
      // les jambes raccourcies : on abaisse le corps pour garder les pieds au sol
      this.root.position.y = this.baseY - (1 - pr.jambes) * 0.93 * pr.taille;
    });
    this.play("repos");
  }

  private baseY = 0;
  setPosition(x: number, y: number, z: number, yaw = 0) {
    this.baseY = y;
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
  }

  private styliser(mat: PBRMaterial, style: Style) {
    mat.metallic = 0;
    if (style === "stylise") {
      mat.bumpTexture = null;
      mat.metallicTexture = null;
      mat.roughness = 0.95;
    } else if (style === "intermediaire") {
      mat.roughness = 0.8;
      mat.metallicTexture = null;
      if (mat.bumpTexture) mat.bumpTexture.level = 0.35;
    } else {
      mat.roughness = 0.7;
    }
  }

  play(a: Anim, loop = true, offset = 0) {
    const g = this.groups.get(a);
    if (!g) return;
    this.current?.stop();
    g.start(loop, 1, g.from + (g.to - g.from) * offset, g.to);
    this.current = g;
  }

  addToShadows(gen: { addShadowCaster(m: AbstractMesh, r?: boolean): void } | null) {
    if (!gen) return;
    for (const m of this.meshes) gen.addShadowCaster(m, false);
  }

  setOutline(on: boolean, width = 0.012) {
    for (const m of this.meshes) {
      // pas de contour sur les petits éléments du visage (yeux, sourcils)
      if (/Eye|Face/i.test(m.name) || (m.material && /Eye/i.test(m.material.name))) continue;
      m.renderOutline = on;
      m.outlineWidth = width;
      m.outlineColor = new Color3(0.08, 0.05, 0.06);
    }
  }
}
