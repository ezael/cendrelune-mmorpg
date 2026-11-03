/**
 * Personnage humanoïde stylisé, construit et animé entièrement en code
 * (pas de squelette : chaque membre pivote autour de son articulation).
 */
import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode } from "@babylonjs/core";
import type { CascadedShadowGenerator, ShadowGenerator } from "@babylonjs/core";
import { hex } from "../world/kit.js";

const SKINS = ["#f2c9a0", "#e0ac7e", "#c98e62", "#a86f4a", "#f6d6b8", "#8a5a3c"];
const HAIRS = ["#3b2416", "#6b3e1f", "#c9893a", "#e8d08a", "#2b2b33", "#9a3b24", "#d8d8e0"];

const matCache = new WeakMap<Scene, Map<string, StandardMaterial>>();
function mat(scene: Scene, color: string, opts: { emissive?: string; spec?: number } = {}): StandardMaterial {
  let cache = matCache.get(scene);
  if (!cache) matCache.set(scene, (cache = new Map()));
  const key = `${color}|${opts.emissive ?? ""}|${opts.spec ?? 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new StandardMaterial(`ch_${key}`, scene);
    m.diffuseColor = hex(color);
    m.specularColor = new Color3(opts.spec ?? 0.05, opts.spec ?? 0.05, opts.spec ?? 0.05);
    m.specularPower = 32;
    if (opts.emissive) m.emissiveColor = hex(opts.emissive);
    cache.set(key, m);
  }
  return m;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function darken(c: string, k: number): string {
  return hex(c).scale(k).toHexString();
}

export interface AnimInput {
  /** vitesse horizontale réelle, en m/s */
  speed: number;
  airborne: boolean;
  /** 0 repos, 1 marche, 2 course, 3 saut, 4 salut, 5 assis */
  anim: number;
  dead: boolean;
}

export class Character {
  readonly root: TransformNode;
  readonly headAnchor: TransformNode;
  readonly meshes: Mesh[] = [];
  private body: TransformNode;
  private torso: TransformNode;
  private head: TransformNode;
  private legL: TransformNode;
  private legR: TransformNode;
  private armL: TransformNode;
  private armR: TransformNode;
  private cape: TransformNode;
  private phase = 0;
  private time = Math.random() * 10;
  private attackT = -1;
  private castT = -1;
  private hurtT = -1;
  private deathK = 0;
  private yaw = 0;

  constructor(private scene: Scene, readonly name: string, tunic: string, opts: { pickId?: string } = {}) {
    const h = hashString(name);
    const skin = SKINS[h % SKINS.length];
    const hair = HAIRS[(h >>> 4) % HAIRS.length];
    const pants = ["#4a3a2e", "#3a3f4a", "#504536"][(h >>> 8) % 3];
    const tunicDark = darken(tunic, 0.72);

    this.root = new TransformNode(`char_${name}`, scene);
    this.body = new TransformNode("body", scene);
    this.body.parent = this.root;

    const add = (m: Mesh, parent: TransformNode, material: StandardMaterial) => {
      m.parent = parent;
      m.material = material;
      m.receiveShadows = true;
      m.metadata = opts.pickId ? { pickId: opts.pickId } : undefined;
      m.isPickable = !!opts.pickId;
      this.meshes.push(m);
      return m;
    };

    // Jambes
    const makeLeg = (side: number) => {
      const pivot = new TransformNode("leg", scene);
      pivot.parent = this.body;
      pivot.position.set(side * 0.14, 0.92, 0);
      const leg = MeshBuilder.CreateCapsule("legm", { radius: 0.11, height: 0.82, tessellation: 8, subdivisions: 1 }, scene);
      leg.position.y = -0.4;
      add(leg, pivot, mat(scene, pants));
      const boot = MeshBuilder.CreateBox("boot", { width: 0.23, height: 0.2, depth: 0.34 }, scene);
      boot.position.set(0, -0.82, 0.05);
      add(boot, pivot, mat(scene, "#3b2a1e"));
      return pivot;
    };
    this.legL = makeLeg(-1);
    this.legR = makeLeg(1);

    // Torse
    this.torso = new TransformNode("torso", scene);
    this.torso.parent = this.body;
    this.torso.position.y = 0.95;
    const chest = MeshBuilder.CreateCapsule("chest", { radius: 0.27, height: 0.8, tessellation: 10, subdivisions: 1 }, scene);
    chest.position.y = 0.32;
    chest.scaling.set(1, 1, 0.78);
    add(chest, this.torso, mat(scene, tunic));
    const skirt = MeshBuilder.CreateCylinder("skirt", { height: 0.36, diameterTop: 0.5, diameterBottom: 0.68, tessellation: 10 }, scene);
    skirt.position.y = -0.04;
    skirt.scaling.z = 0.82;
    add(skirt, this.torso, mat(scene, tunicDark));
    const belt = MeshBuilder.CreateCylinder("belt", { height: 0.08, diameter: 0.55, tessellation: 12 }, scene);
    belt.position.y = 0.1;
    belt.scaling.z = 0.8;
    add(belt, this.torso, mat(scene, "#4a3020"));
    const buckle = MeshBuilder.CreateBox("buckle", { width: 0.1, height: 0.08, depth: 0.04 }, scene);
    buckle.position.set(0, 0.1, 0.23);
    add(buckle, this.torso, mat(scene, "#e0b84a", { spec: 0.6 }));
    for (const side of [-1, 1]) {
      const pad = MeshBuilder.CreateSphere("pad", { diameter: 0.26, segments: 6 }, scene);
      pad.position.set(side * 0.31, 0.58, 0);
      pad.scaling.set(1, 0.7, 1);
      add(pad, this.torso, mat(scene, tunicDark));
    }

    // Tête
    this.head = new TransformNode("head", scene);
    this.head.parent = this.torso;
    this.head.position.y = 0.9;
    const skull = MeshBuilder.CreateSphere("skull", { diameter: 0.5, segments: 12 }, scene);
    add(skull, this.head, mat(scene, skin));
    const hairM = MeshBuilder.CreateSphere("hair", { diameter: 0.55, segments: 10, slice: 0.55 }, scene);
    hairM.position.set(0, 0.03, -0.03);
    hairM.rotation.x = -0.35;
    add(hairM, this.head, mat(scene, hair));
    for (const side of [-1, 1]) {
      const eye = MeshBuilder.CreateSphere("eye", { diameter: 0.07, segments: 6 }, scene);
      eye.position.set(side * 0.095, 0.02, 0.22);
      eye.scaling.set(0.8, 1.2, 0.5);
      add(eye, this.head, mat(scene, "#1a1420"));
    }
    const nose = MeshBuilder.CreateSphere("nose", { diameter: 0.07, segments: 6 }, scene);
    nose.position.set(0, -0.04, 0.25);
    add(nose, this.head, mat(scene, darken(skin, 0.92)));

    // Bras
    const makeArm = (side: number) => {
      const pivot = new TransformNode("arm", scene);
      pivot.parent = this.torso;
      pivot.position.set(side * 0.36, 0.55, 0);
      const arm = MeshBuilder.CreateCapsule("armm", { radius: 0.085, height: 0.62, tessellation: 8, subdivisions: 1 }, scene);
      arm.position.y = -0.27;
      add(arm, pivot, mat(scene, tunic));
      const hand = MeshBuilder.CreateSphere("hand", { diameter: 0.17, segments: 6 }, scene);
      hand.position.y = -0.6;
      add(hand, pivot, mat(scene, skin));
      return pivot;
    };
    this.armL = makeArm(-1);
    this.armR = makeArm(1);

    // Épée dans la main droite
    const sword = new TransformNode("sword", scene);
    sword.parent = this.armR;
    sword.position.set(0, -0.62, 0.02);
    sword.rotation.x = 1.25;
    const grip = MeshBuilder.CreateCylinder("grip", { height: 0.22, diameter: 0.05, tessellation: 6 }, scene);
    add(grip, sword, mat(scene, "#4a3020"));
    const guard = MeshBuilder.CreateBox("guard", { width: 0.28, height: 0.05, depth: 0.06 }, scene);
    guard.position.y = 0.12;
    add(guard, sword, mat(scene, "#c9a54a", { spec: 0.7 }));
    const blade = MeshBuilder.CreateBox("blade", { width: 0.07, height: 0.85, depth: 0.02 }, scene);
    blade.position.y = 0.55;
    add(blade, sword, mat(scene, "#d8dee8", { spec: 0.9 }));

    // Cape
    this.cape = new TransformNode("cape", scene);
    this.cape.parent = this.torso;
    this.cape.position.set(0, 0.68, -0.2);
    const capeM = MeshBuilder.CreatePlane("capem", { width: 0.62, height: 1.0, sideOrientation: Mesh.DOUBLESIDE }, scene);
    capeM.position.y = -0.5;
    add(capeM, this.cape, mat(scene, darken(tunic, 0.55)));

    this.headAnchor = new TransformNode("headAnchor", scene);
    this.headAnchor.parent = this.root;
    this.headAnchor.position.y = 2.35;
  }

  addToShadows(gen: ShadowGenerator | CascadedShadowGenerator | null) {
    if (!gen) return;
    for (const m of this.meshes) gen.addShadowCaster(m, false);
  }

  attack() { this.attackT = 0; }
  cast() { this.castT = 0; }
  hurt() { this.hurtT = 0; }

  setPosition(x: number, y: number, z: number) {
    this.root.position.set(x, y, z);
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
    this.time += dt;
    const moving = Math.min(1, s.speed / 5.5);
    this.phase += dt * (3 + s.speed * 1.55);
    const sw = Math.sin(this.phase);

    let legL = 0, legR = 0, armLx = 0, armRx = 0, armLz = 0.08, armRz = -0.08;
    let bodyY = 0, torsoX = 0, torsoY = 0, headX = 0;

    if (s.airborne || s.anim === 3) {
      legL = -0.7; legR = 0.35; armLx = -0.5; armRx = -0.3; armLz = 0.6; armRz = -0.6;
    } else if (s.speed > 0.3) {
      legL = sw * 0.85 * moving;
      legR = -sw * 0.85 * moving;
      armLx = -sw * 0.7 * moving;
      armRx = sw * 0.55 * moving;
      bodyY = Math.abs(Math.cos(this.phase)) * 0.07 * moving;
      torsoX = 0.12 * moving;
      torsoY = sw * 0.08 * moving;
    } else if (s.anim === 5) {
      legL = legR = -1.45;
      bodyY = -0.5;
      armLx = armRx = -0.35;
    } else {
      const br = Math.sin(this.time * 1.8);
      armLx = br * 0.04;
      armRx = -br * 0.04;
      headX = br * 0.03;
    }

    if (s.anim === 4 && !s.dead) {
      armRz = -2.7 + Math.sin(this.time * 9) * 0.35;
      armRx = 0;
    }

    if (this.castT >= 0) {
      this.castT += dt;
      const k = Math.sin(Math.min(1, this.castT / 0.9) * Math.PI);
      armLx = armRx = -2.2 * k;
      armLz = 0.3 * k;
      armRz = -0.3 * k;
      if (this.castT > 0.9) this.castT = -1;
    }

    if (this.attackT >= 0) {
      this.attackT += dt;
      const p = this.attackT / 0.5;
      if (p < 0.35) {
        armRx = -2.7 * (p / 0.35);
        torsoY = -0.35 * (p / 0.35);
      } else {
        const k = (p - 0.35) / 0.65;
        armRx = -2.7 + 3.3 * Math.min(1, k * 1.6);
        torsoY = -0.35 + 0.75 * Math.min(1, k * 1.6);
      }
      if (p >= 1) this.attackT = -1;
    }

    // Recul quand on encaisse un coup
    let hurtK = 0;
    if (this.hurtT >= 0) {
      this.hurtT += dt;
      hurtK = Math.sin(Math.min(1, this.hurtT / 0.25) * Math.PI);
      if (this.hurtT > 0.25) this.hurtT = -1;
    }

    // Mort : le personnage s'effondre.
    this.deathK += ((s.dead ? 1 : 0) - this.deathK) * Math.min(1, dt * 5);

    const k = Math.min(1, dt * 16);
    const lerp = (node: TransformNode, axis: "x" | "y" | "z", v: number) => {
      node.rotation[axis] += (v - node.rotation[axis]) * k;
    };
    lerp(this.legL, "x", legL);
    lerp(this.legR, "x", legR);
    lerp(this.armL, "x", armLx);
    lerp(this.armR, "x", armRx);
    lerp(this.armL, "z", armLz);
    lerp(this.armR, "z", armRz);
    lerp(this.torso, "x", torsoX - hurtK * 0.25);
    lerp(this.torso, "y", torsoY);
    lerp(this.head, "x", headX);
    this.torso.scaling.y = 1 + Math.sin(this.time * 1.8) * 0.012;
    this.body.position.y += (bodyY - this.body.position.y) * k;
    this.body.rotation.x = -this.deathK * Math.PI * 0.5;
    this.body.position.z = -this.deathK * 0.6;
    if (this.deathK > 0.01) this.body.position.y = bodyY + this.deathK * 0.25;
    this.cape.rotation.x = 0.12 + moving * 0.55 + Math.sin(this.time * 3 + this.phase * 0.5) * (0.04 + moving * 0.08) + (s.airborne ? 0.5 : 0);
  }

  dispose() {
    this.root.dispose(false, false);
  }
}

