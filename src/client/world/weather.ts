/**
 * Météo d'ambiance : particules qui suivent la caméra (pollen, feuilles mortes,
 * neige, brume rampante, cendres et braises).
 */
import { Color4, DynamicTexture, ParticleSystem, Scene, Texture, Vector3 } from "@babylonjs/core";
import type { Biome } from "./biomes.js";
import { c4, hex } from "./kit.js";
import { LOW_QUALITY } from "../quality.js";

/** Petite feuille en forme d'amande, dessinée en code. */
function leafTexture(scene: Scene): Texture {
  const s = 64;
  const tex = new DynamicTexture("leafTex", { width: s, height: s }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.06);
  ctx.bezierCurveTo(s * 0.95, s * 0.35, s * 0.8, s * 0.8, s * 0.5, s * 0.94);
  ctx.bezierCurveTo(s * 0.2, s * 0.8, s * 0.05, s * 0.35, s * 0.5, s * 0.06);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.12);
  ctx.lineTo(s * 0.5, s * 0.9);
  ctx.stroke();
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export interface Weather {
  update(center: Vector3, night: number): void;
  dispose(): void;
}

export function makeWeather(scene: Scene, biome: Biome, dot: Texture): Weather {
  const w = biome.weather;
  const k = (LOW_QUALITY ? 0.4 : 1) * w.amount;
  const col1 = c4(hex(w.color), 1);
  const col2 = c4(hex(w.color2), 1);
  const systems: ParticleSystem[] = [];
  const extra: Array<{ dispose(): void }> = [];
  let onUpdate: (center: Vector3, night: number) => void = () => undefined;

  const make = (name: string, capacity: number, tex: Texture) => {
    const ps = new ParticleSystem(name, Math.ceil(capacity * k), scene);
    ps.particleTexture = tex;
    ps.emitter = new Vector3();
    systems.push(ps);
    return ps;
  };

  switch (w.kind) {
    case "pollen": {
      const ps = make("pollen", 500, dot);
      ps.minEmitBox = new Vector3(-30, 0.3, -30);
      ps.maxEmitBox = new Vector3(30, 6, 30);
      ps.color1 = new Color4(col1.r, col1.g, col1.b, 0.9);
      ps.color2 = new Color4(col2.r, col2.g, col2.b, 0.7);
      ps.colorDead = new Color4(col1.r, col1.g, col1.b, 0);
      ps.minSize = 0.04;
      ps.maxSize = 0.09;
      ps.minLifeTime = 4;
      ps.maxLifeTime = 8;
      ps.emitRate = 70 * k;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.gravity = new Vector3(0.15, 0.05, 0.05);
      ps.direction1 = new Vector3(-0.2, -0.05, -0.2);
      ps.direction2 = new Vector3(0.3, 0.15, 0.3);
      ps.minEmitPower = 0.1;
      ps.maxEmitPower = 0.3;
      // Le pollen ne se voit qu'au soleil.
      onUpdate = (_c, night) => (ps.emitRate = 70 * k * (1 - night));
      break;
    }
    case "feuilles": {
      const tex = leafTexture(scene);
      extra.push(tex);
      const ps = make("leaves", 420, tex);
      ps.minEmitBox = new Vector3(-28, 7, -28);
      ps.maxEmitBox = new Vector3(28, 13, 28);
      ps.color1 = col1;
      ps.color2 = col2;
      ps.colorDead = new Color4(col1.r * 0.7, col1.g * 0.6, col1.b * 0.5, 0);
      ps.minSize = 0.16;
      ps.maxSize = 0.3;
      ps.minLifeTime = 7;
      ps.maxLifeTime = 11;
      ps.emitRate = 40 * k;
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.gravity = new Vector3(0.5, -0.9, 0.2);
      ps.direction1 = new Vector3(-0.6, -0.3, -0.6);
      ps.direction2 = new Vector3(0.6, 0, 0.6);
      ps.minEmitPower = 0.2;
      ps.maxEmitPower = 0.6;
      ps.minAngularSpeed = -2.5;
      ps.maxAngularSpeed = 2.5;
      ps.addVelocityGradient(0, 1);
      ps.addVelocityGradient(1, 0.6);
      break;
    }
    case "neige": {
      const ps = make("snow", 2400, dot);
      ps.minEmitBox = new Vector3(-34, 10, -34);
      ps.maxEmitBox = new Vector3(34, 18, 34);
      ps.color1 = new Color4(1, 1, 1, 0.95);
      ps.color2 = new Color4(col2.r, col2.g, col2.b, 0.8);
      ps.colorDead = new Color4(1, 1, 1, 0.2);
      ps.minSize = 0.06;
      ps.maxSize = 0.16;
      ps.minLifeTime = 7;
      ps.maxLifeTime = 10;
      ps.emitRate = 320 * k;
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.gravity = new Vector3(0.25, -1.4, 0.1);
      ps.direction1 = new Vector3(-0.4, -0.2, -0.4);
      ps.direction2 = new Vector3(0.4, 0, 0.4);
      ps.minEmitPower = 0.1;
      ps.maxEmitPower = 0.4;
      ps.addVelocityGradient(0, 1);
      break;
    }
    case "brume": {
      // Grandes nappes très transparentes qui glissent au ras du sol.
      const ps = make("mist", 160, dot);
      ps.minEmitBox = new Vector3(-36, -0.2, -36);
      ps.maxEmitBox = new Vector3(36, 0.8, 36);
      ps.color1 = new Color4(col1.r, col1.g, col1.b, 0.16);
      ps.color2 = new Color4(col2.r, col2.g, col2.b, 0.11);
      ps.colorDead = new Color4(col1.r, col1.g, col1.b, 0);
      ps.minSize = 7;
      ps.maxSize = 13;
      ps.minScaleY = 0.35;
      ps.maxScaleY = 0.5;
      ps.minLifeTime = 9;
      ps.maxLifeTime = 15;
      ps.emitRate = 14 * k;
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.gravity = new Vector3(0.12, 0, 0.05);
      ps.direction1 = new Vector3(-0.3, 0, -0.3);
      ps.direction2 = new Vector3(0.3, 0.02, 0.3);
      ps.minEmitPower = 0.1;
      ps.maxEmitPower = 0.3;
      ps.addColorGradient(0, new Color4(col1.r, col1.g, col1.b, 0));
      ps.addColorGradient(0.3, new Color4(col1.r, col1.g, col1.b, 0.16));
      ps.addColorGradient(0.7, new Color4(col2.r, col2.g, col2.b, 0.12));
      ps.addColorGradient(1, new Color4(col2.r, col2.g, col2.b, 0));
      ps.preWarmCycles = 120;
      ps.preWarmStepOffset = 5;
      onUpdate = (_c, night) => {
        // La brume s'assombrit la nuit, sinon elle brillerait dans le noir.
        const d = 1 - night * 0.75;
        ps.color1 = new Color4(col1.r * d, col1.g * d, col1.b * d, 0.16);
      };
      break;
    }
    case "cendres": {
      const ash = make("ash", 900, dot);
      ash.minEmitBox = new Vector3(-30, 8, -30);
      ash.maxEmitBox = new Vector3(30, 16, 30);
      ash.color1 = new Color4(0.45, 0.42, 0.4, 0.8);
      ash.color2 = new Color4(0.7, 0.66, 0.62, 0.6);
      ash.colorDead = new Color4(0.4, 0.4, 0.4, 0);
      ash.minSize = 0.05;
      ash.maxSize = 0.12;
      ash.minLifeTime = 8;
      ash.maxLifeTime = 12;
      ash.emitRate = 90 * k;
      ash.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ash.gravity = new Vector3(0.3, -0.6, 0.1);
      ash.direction1 = new Vector3(-0.4, -0.2, -0.4);
      ash.direction2 = new Vector3(0.4, 0.1, 0.4);
      ash.minEmitPower = 0.1;
      ash.maxEmitPower = 0.3;
      const embers = make("embers", 400, dot);
      embers.minEmitBox = new Vector3(-26, 0, -26);
      embers.maxEmitBox = new Vector3(26, 1.5, 26);
      embers.color1 = col1;
      embers.color2 = col2;
      embers.colorDead = new Color4(1, 0.2, 0, 0);
      embers.minSize = 0.05;
      embers.maxSize = 0.12;
      embers.minLifeTime = 3;
      embers.maxLifeTime = 6;
      embers.emitRate = 45 * k;
      embers.blendMode = ParticleSystem.BLENDMODE_ADD;
      embers.gravity = new Vector3(0.2, 0.9, 0.1);
      embers.direction1 = new Vector3(-0.5, 0.5, -0.5);
      embers.direction2 = new Vector3(0.5, 1.5, 0.5);
      embers.minEmitPower = 0.3;
      embers.maxEmitPower = 0.8;
      break;
    }
  }

  for (const ps of systems) {
    ps.updateSpeed = 0.016;
    ps.isLocal = false;
    ps.start();
  }

  return {
    update(center: Vector3, night: number) {
      for (const ps of systems) (ps.emitter as Vector3).copyFrom(center);
      onUpdate(center, night);
    },
    dispose() {
      systems.forEach((s) => s.dispose(false));
      extra.forEach((e) => e.dispose());
    },
  };
}
