/**
 * Noms, barres de vie, bulles de dialogue et chiffres de dégâts flottants,
 * accrochés aux entités 3D (Babylon GUI).
 */
import { Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { AdvancedDynamicTexture, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";

export interface Plate {
  root: Rectangle;
  name: TextBlock;
  hpBg: Rectangle;
  hpFill: Rectangle;
  bubble: Rectangle;
  bubbleText: TextBlock;
  bubbleUntil: number;
  anchor: TransformNode;
}

interface Floater {
  text: TextBlock;
  anchor: TransformNode;
  t: number;
  life: number;
  rise: number;
}

export class Nameplates {
  readonly ui: AdvancedDynamicTexture;
  private plates = new Set<Plate>();
  private floaters: Floater[] = [];

  constructor(private scene: Scene) {
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI("plates", true, scene);
    this.ui.renderAtIdealSize = false;
  }

  create(anchor: TransformNode, name: string, color: string, showHp: boolean): Plate {
    const root = new Rectangle();
    root.thickness = 0;
    root.width = "320px";
    root.height = "120px";
    root.isPointerBlocker = false;
    this.ui.addControl(root);
    root.linkWithMesh(anchor);
    root.linkOffsetY = -40;

    const stack = new StackPanel();
    stack.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    root.addControl(stack);

    const bubble = new Rectangle();
    bubble.width = "120px";
    bubble.height = "30px";
    bubble.cornerRadius = 10;
    bubble.color = "rgba(232,193,112,0.6)";
    bubble.thickness = 1;
    bubble.background = "rgba(16,14,26,0.82)";
    bubble.paddingBottom = "6px";
    bubble.isVisible = false;
    const bubbleText = new TextBlock();
    bubbleText.color = "#f4ecdc";
    bubbleText.fontSize = 14;
    bubbleText.fontFamily = "Nunito, sans-serif";
    bubbleText.textWrapping = false;
    bubble.addControl(bubbleText);
    stack.addControl(bubble);

    const label = new TextBlock();
    label.text = name;
    label.color = color;
    label.fontSize = 15;
    label.fontWeight = "800";
    label.fontFamily = "Nunito, sans-serif";
    label.height = "20px";
    label.outlineWidth = 4;
    label.outlineColor = "#0a0810";
    stack.addControl(label);

    const hpBg = new Rectangle();
    hpBg.width = "70px";
    hpBg.height = "7px";
    hpBg.thickness = 1;
    hpBg.color = "#0a0810";
    hpBg.background = "rgba(0,0,0,0.6)";
    hpBg.cornerRadius = 2;
    hpBg.isVisible = showHp;
    const hpFill = new Rectangle();
    hpFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    hpFill.width = 1;
    hpFill.thickness = 0;
    hpFill.background = "#e2463a";
    hpBg.addControl(hpFill);
    stack.addControl(hpBg);

    const plate: Plate = { root, name: label, hpBg, hpFill, bubble, bubbleText, bubbleUntil: 0, anchor };
    this.plates.add(plate);
    return plate;
  }

  setHp(p: Plate, ratio: number, visible = true) {
    p.hpBg.isVisible = visible;
    p.hpFill.width = Math.max(0, Math.min(1, ratio));
    p.hpFill.background = ratio > 0.5 ? "#4fd05a" : ratio > 0.25 ? "#e8c13a" : "#e2463a";
  }

  say(p: Plate, text: string) {
    const shown = text.length > 34 ? `${text.slice(0, 32)}…` : text;
    p.bubbleText.text = shown;
    p.bubble.width = `${Math.min(300, 24 + shown.length * 7.6)}px`;
    p.bubble.isVisible = true;
    p.bubbleUntil = performance.now() + 5500;
  }

  remove(p: Plate) {
    p.root.dispose();
    this.plates.delete(p);
  }

  /** Chiffre flottant (dégâts, soins, expérience) au-dessus d'une position. */
  float(position: Vector3, text: string, color: string, size = 22) {
    const anchor = new TransformNode("floatAnchor", this.scene);
    anchor.position.copyFrom(position);
    const t = new TextBlock();
    t.text = text;
    t.color = color;
    t.fontSize = size;
    t.fontWeight = "900";
    t.fontFamily = "Nunito, sans-serif";
    t.outlineWidth = 5;
    t.outlineColor = "#0a0810";
    t.width = "200px";
    t.height = "40px";
    t.isPointerBlocker = false;
    this.ui.addControl(t);
    t.linkWithMesh(anchor);
    const offsetX = (Math.random() - 0.5) * 40;
    t.linkOffsetX = offsetX;
    this.floaters.push({ text: t, anchor, t: 0, life: 1.2, rise: 70 + Math.random() * 20 });
  }

  update(dt: number, camPos: Vector3) {
    const now = performance.now();
    for (const p of this.plates) {
      if (p.bubble.isVisible && now > p.bubbleUntil) p.bubble.isVisible = false;
      const d = Vector3.Distance(camPos, p.anchor.getAbsolutePosition());
      p.root.alpha = d > 60 ? 0 : d > 45 ? (60 - d) / 15 : 1;
    }
    this.floaters = this.floaters.filter((f) => {
      f.t += dt;
      const k = f.t / f.life;
      f.text.linkOffsetY = -40 - f.rise * k;
      f.text.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      f.text.scaleX = f.text.scaleY = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : 1.2 - Math.min(0.2, (k - 0.12) * 0.5);
      if (k >= 1) {
        f.text.dispose();
        f.anchor.dispose();
        return false;
      }
      return true;
    });
  }

  clear() {
    for (const p of [...this.plates]) this.remove(p);
    for (const f of this.floaters) {
      f.text.dispose();
      f.anchor.dispose();
    }
    this.floaters = [];
  }
}
