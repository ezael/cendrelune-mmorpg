/**
 * Monstres « gelées » : un corps translucide qui rebondit, des yeux, et des
 * cristaux pour les variantes de la grotte.
 */
import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode } from "@babylonjs/core";
import type { CascadedShadowGenerator, ShadowGenerator } from "@babylonjs/core";
import type { MobKind } from "../../shared/rules.js";
import { hex } from "../world/kit.js";

export class MobView {
  readonly root: TransformNode;
  readonly headAnchor: TransformNode;
  readonly meshes: Mesh[] = [];
  private body: Mesh;
  private squash: TransformNode;
  private time = Math.random() * 10;
  private hop = 0;
  private attackT = -1;
  private hurtT = -1;
  private deathK = 0;
  private yaw = 0;
  private bodyMat: StandardMaterial;

  constructor(scene: Scene, readonly id: string, readonly kind: MobKind) {
    const s = kind.scale;
    this.root = new TransformNode(`mob_${id}`, scene);
    this.squash = new TransformNode("squash", scene);
    this.squash.parent = this.root;

    this.bodyMat = new StandardMaterial(`mobMat_${id}`, scene);
    this.bodyMat.diffuseColor = hex(kind.color);
    this.bodyMat.specularColor = new Color3(0.6, 0.6, 0.6);
    this.bodyMat.specularPower = 48;
    this.bodyMat.emissiveColor = hex(kind.glow ?? kind.color).scale(kind.glow ? 0.35 : 0.12);
    this.bodyMat.alpha = 0.88;

    const add = (m: Mesh, mat: StandardMaterial) => {
      m.parent = this.squash;
      m.material = mat;
      m.metadata = { pickId: id, mob: true };
      m.isPickable = true;
      this.meshes.push(m);
      return m;
    };

    this.body = MeshBuilder.CreateSphere("slime", { diameter: 1.1 * s, segments: 14 }, scene);
    this.body.position.y = 0.45 * s;
    this.body.scaling.y = 0.82;
    add(this.body, this.bodyMat);

    const core = MeshBuilder.CreateSphere("core", { diameter: 0.38 * s, segments: 8 }, scene);
    core.position.set(0, 0.42 * s, -0.05 * s);
    const coreMat = new StandardMaterial(`core_${id}`, scene);
    coreMat.diffuseColor = hex(kind.color).scale(0.5);
    coreMat.emissiveColor = hex(kind.glow ?? kind.color).scale(0.4);
    add(core, coreMat);

    const white = new StandardMaterial(`eyeW_${id}`, scene);
    white.diffuseColor = Color3.White();
    white.emissiveColor = new Color3(0.3, 0.3, 0.3);
    const black = new StandardMaterial(`eyeB_${id}`, scene);
    black.diffuseColor = hex("#15101c");
    black.specularColor = Color3.White();
    for (const side of [-1, 1]) {
      const eye = MeshBuilder.CreateSphere("eye", { diameter: 0.24 * s, segments: 8 }, scene);
      eye.position.set(side * 0.18 * s, 0.6 * s, 0.4 * s);
      add(eye, white);
      const pupil = MeshBuilder.CreateSphere("pupil", { diameter: 0.12 * s, segments: 6 }, scene);
      pupil.position.set(side * 0.19 * s, 0.6 * s, 0.5 * s);
      add(pupil, black);
    }

    if (kind.glow) {
      const crystalMat = new StandardMaterial(`cr_${id}`, scene);
      crystalMat.diffuseColor = hex(kind.glow);
      crystalMat.emissiveColor = hex(kind.glow).scale(0.7);
      crystalMat.specularColor = Color3.White();
      const n = kind.boss ? 7 : 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const cr = MeshBuilder.CreatePolyhedron("spike", { type: 1, size: 0.12 * s }, scene);
        cr.position.set(Math.cos(a) * 0.22 * s, 0.85 * s, Math.sin(a) * 0.22 * s - 0.05 * s);
        cr.scaling.y = 2.4;
        cr.rotation.set(Math.sin(a) * 0.5, a, -Math.cos(a) * 0.5);
        add(cr, crystalMat);
      }
      if (kind.boss) {
        const crown = MeshBuilder.CreatePolyhedron("crown", { type: 1, size: 0.2 * s }, scene);
        crown.position.set(0, 1.05 * s, 0);
        crown.scaling.y = 2.6;
        add(crown, crystalMat);
      }
    }

    this.headAnchor = new TransformNode("mobHead", scene);
    this.headAnchor.parent = this.root;
    this.headAnchor.position.y = 1.25 * s + 0.35;
  }

  addToShadows(gen: ShadowGenerator | CascadedShadowGenerator | null) {
    if (!gen) return;
    gen.addShadowCaster(this.body, false);
  }

  attack() { this.attackT = 0; }
  hurt() { this.hurtT = 0; }

  face(yaw: number, dt: number) {
    let d = yaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 8);
    this.root.rotation.y = this.yaw;
  }

  update(dt: number, speed: number, dead: boolean) {
    this.time += dt;
    let sy = 1 + Math.sin(this.time * 3) * 0.05;
    let sxz = 1 - Math.sin(this.time * 3) * 0.03;
    let y = 0;
    if (speed > 0.2) {
      this.hop += dt * (4 + speed * 1.4);
      const p = Math.abs(Math.sin(this.hop));
      y = p * 0.45 * this.kind.scale;
      sy = 0.85 + p * 0.3;
      sxz = 1.1 - p * 0.15;
    }
    if (this.attackT >= 0) {
      this.attackT += dt;
      const k = Math.sin(Math.min(1, this.attackT / 0.35) * Math.PI);
      sy *= 1 - k * 0.3;
      sxz *= 1 + k * 0.25;
      this.squash.position.z = k * 0.35 * this.kind.scale;
      if (this.attackT > 0.35) {
        this.attackT = -1;
        this.squash.position.z = 0;
      }
    }
    if (this.hurtT >= 0) {
      this.hurtT += dt;
      const k = 1 - Math.min(1, this.hurtT / 0.3);
      this.bodyMat.emissiveColor = Color3.Lerp(hex(this.kind.glow ?? this.kind.color).scale(this.kind.glow ? 0.35 : 0.12), Color3.White(), k * 0.8);
      if (this.hurtT > 0.3) this.hurtT = -1;
    }
    this.deathK += ((dead ? 1 : 0) - this.deathK) * Math.min(1, dt * 4);
    sy *= 1 - this.deathK * 0.85;
    sxz *= 1 + this.deathK * 0.5;
    this.squash.scaling.set(sxz, sy, sxz);
    this.squash.position.y = y * (1 - this.deathK);
    this.bodyMat.alpha = 0.88 * (1 - this.deathK * 0.7);
    this.root.setEnabled(this.deathK < 0.97 || !dead);
  }

  dispose() {
    this.root.dispose(false, true);
  }
}
