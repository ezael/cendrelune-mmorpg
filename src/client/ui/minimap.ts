/** Mini-carte ronde, centrée sur le joueur, nord en haut. */
import { DUNGEON_MAP, PATHS, WATER_LEVEL, ZONES, getOutdoorObstacles, heightAt, type ZoneId } from "../../shared/zones.js";

const RES = 2; // pixels par mètre dans l'image de fond

export interface MapDot {
  x: number;
  z: number;
  color: string;
  size: number;
}

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private half = 110;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  setZone(zone: ZoneId) {
    const def = ZONES[zone];
    this.half = def.half;
    const size = Math.ceil(def.half * 2 * RES);
    const bg = document.createElement("canvas");
    bg.width = bg.height = size;
    const g = bg.getContext("2d")!;
    const toPx = (v: number) => (v + def.half) * RES;

    if (def.kind === "outdoor") {
      const img = g.createImageData(size, size);
      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const x = px / RES - def.half;
          const z = def.half - py / RES;
          const h = heightAt(zone, x, z);
          let r = 96, gg = 150, b = 74;
          if (h < WATER_LEVEL) { r = 52; gg = 120; b = 160; }
          else if (h < WATER_LEVEL + 0.4) { r = 200; gg = 184; b = 130; }
          else if (h > 12) { const k = Math.min(1, (h - 12) / 14); r = 96 + k * 80; gg = 150 - k * 20; b = 74 + k * 90; }
          const shade = 0.85 + Math.min(0.25, h * 0.02);
          const i = (py * size + px) * 4;
          img.data[i] = r * shade;
          img.data[i + 1] = gg * shade;
          img.data[i + 2] = b * shade;
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      g.strokeStyle = "rgba(196,160,110,0.95)";
      g.lineWidth = 3 * RES;
      g.lineCap = "round";
      for (const path of PATHS) {
        g.beginPath();
        path.forEach(([x, z], i) => (i ? g.lineTo(toPx(x), toPx(-z)) : g.moveTo(toPx(x), toPx(-z))));
        g.stroke();
      }
      for (const o of getOutdoorObstacles()) {
        if (o.kind === "pine" || o.kind === "oak") {
          g.fillStyle = "rgba(40,90,45,0.85)";
          g.beginPath();
          g.arc(toPx(o.x), toPx(-o.z), 1.3 * RES * o.scale, 0, Math.PI * 2);
          g.fill();
        } else if (o.kind === "house") {
          g.fillStyle = "#c46a4a";
          g.fillRect(toPx(o.x) - 2.6 * RES, toPx(-o.z) - 2.6 * RES, 5.2 * RES, 5.2 * RES);
        }
      }
    } else {
      g.fillStyle = "#0c0b14";
      g.fillRect(0, 0, size, size);
      const rows = DUNGEON_MAP.length;
      const cols = DUNGEON_MAP[0].length;
      const cell = 4 * RES;
      const ox = (size - cols * cell) / 2;
      const oy = (size - rows * cell) / 2;
      DUNGEON_MAP.forEach((line, r) => {
        for (let c = 0; c < cols; c++) {
          if (line[c] === "#") continue;
          g.fillStyle = "#5a5470";
          g.fillRect(ox + c * cell, oy + r * cell, cell + 0.5, cell + 0.5);
        }
      });
    }
    for (const p of def.portals) {
      g.fillStyle = "#b48cff";
      g.beginPath();
      g.arc(toPx(p.x), toPx(-p.z), 3 * RES, 0, Math.PI * 2);
      g.fill();
    }
    this.bg = bg;
  }

  draw(px: number, pz: number, yaw: number, camYaw: number, dots: MapDot[]) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const view = 55; // rayon visible en mètres
    const scale = W / 2 / view;
    ctx.save();
    ctx.clearRect(0, 0, W, W);
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#0c0b14";
    ctx.fillRect(0, 0, W, W);
    if (this.bg) {
      const sx = (px + this.half) * RES - view * RES;
      const sy = (-pz + this.half) * RES - view * RES;
      ctx.drawImage(this.bg, sx, sy, view * 2 * RES, view * 2 * RES, 0, 0, W, W);
    }
    for (const d of dots) {
      const x = W / 2 + (d.x - px) * scale;
      const y = W / 2 - (d.z - pz) * scale;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(x, y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cône de vision de la caméra
    ctx.translate(W / 2, W / 2);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    const look = Math.PI - camYaw; // camYaw = angle alpha de la caméra orbitale
    ctx.arc(0, 0, W * 0.4, look - 0.5, look + 0.5);
    ctx.closePath();
    ctx.fill();
    // Flèche du joueur
    ctx.rotate(yaw);
    ctx.fillStyle = "#ffe08a";
    ctx.strokeStyle = "#2a1c08";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // Repère nord
    ctx.fillStyle = "#e8c170";
    ctx.font = "bold 12px Nunito, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", W / 2, 14);
  }
}
