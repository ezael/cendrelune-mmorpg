/** Petits effets de particules ponctuels (soin, montée de niveau, coup critique). */
import { Color4, ParticleSystem, Scene, Texture, Vector3 } from "@babylonjs/core";
import { softDotTexture } from "./world/kit.js";

let tex: Texture | null = null;

function dot(scene: Scene): Texture {
  if (!tex || tex.getScene() !== scene) tex = softDotTexture(scene, "fxDot");
  return tex;
}

export function burst(
  scene: Scene,
  at: Vector3,
  kind: "heal" | "level" | "hit" | "portal",
) {
  const ps = new ParticleSystem(`fx_${kind}`, 160, scene);
  ps.particleTexture = dot(scene);
  ps.emitter = at.clone();
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.updateSpeed = 0.016;
  switch (kind) {
    case "heal":
      ps.createCylinderEmitter(0.6, 1.8, 0.2, 0);
      ps.color1 = new Color4(0.5, 1, 0.5, 1);
      ps.color2 = new Color4(0.9, 1, 0.6, 1);
      ps.colorDead = new Color4(0.2, 0.8, 0.3, 0);
      ps.minSize = 0.08; ps.maxSize = 0.2;
      ps.minLifeTime = 0.6; ps.maxLifeTime = 1.2;
      ps.gravity = new Vector3(0, 2.2, 0);
      ps.manualEmitCount = 80;
      break;
    case "level":
      ps.createSphereEmitter(0.5, 0);
      ps.color1 = new Color4(1, 0.85, 0.35, 1);
      ps.color2 = new Color4(1, 1, 0.7, 1);
      ps.colorDead = new Color4(1, 0.6, 0.1, 0);
      ps.minSize = 0.1; ps.maxSize = 0.3;
      ps.minLifeTime = 0.8; ps.maxLifeTime = 1.6;
      ps.minEmitPower = 2; ps.maxEmitPower = 5;
      ps.gravity = new Vector3(0, 1.5, 0);
      ps.manualEmitCount = 150;
      break;
    case "hit":
      ps.createSphereEmitter(0.2, 0);
      ps.color1 = new Color4(1, 0.95, 0.7, 1);
      ps.color2 = new Color4(1, 0.7, 0.3, 1);
      ps.colorDead = new Color4(1, 0.3, 0, 0);
      ps.minSize = 0.05; ps.maxSize = 0.14;
      ps.minLifeTime = 0.2; ps.maxLifeTime = 0.45;
      ps.minEmitPower = 2; ps.maxEmitPower = 4;
      ps.manualEmitCount = 24;
      break;
    case "portal":
      ps.createSphereEmitter(1.2, 0);
      ps.color1 = new Color4(0.7, 0.55, 1, 1);
      ps.color2 = new Color4(0.45, 0.8, 1, 1);
      ps.colorDead = new Color4(0.3, 0.2, 0.8, 0);
      ps.minSize = 0.1; ps.maxSize = 0.25;
      ps.minLifeTime = 0.5; ps.maxLifeTime = 1;
      ps.minEmitPower = 1; ps.maxEmitPower = 3;
      ps.manualEmitCount = 120;
      break;
  }
  ps.targetStopDuration = 2;
  ps.disposeOnStop = true;
  ps.start();
}
