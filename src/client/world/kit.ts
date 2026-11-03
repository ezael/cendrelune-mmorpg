/**
 * Boîte à outils pour fabriquer des assets low-poly en code : pièces colorées par
 * sommet, fusionnées en un seul mesh, puis affichées en facettes (flat shading).
 */
import {
  Color3, Color4, DynamicTexture, Matrix, Mesh, Quaternion, Scene, StandardMaterial,
  Texture, Vector3, VertexBuffer,
} from "@babylonjs/core";

export function hex(c: string): Color3 {
  return Color3.FromHexString(c);
}

/** Variation légère d'une couleur, pour éviter les aplats trop uniformes. */
export function jitter(c: Color3, amount: number, r: () => number): Color3 {
  const k = 1 + (r() * 2 - 1) * amount;
  return new Color3(
    Math.min(1, c.r * k + (r() - 0.5) * amount * 0.2),
    Math.min(1, c.g * k + (r() - 0.5) * amount * 0.2),
    Math.min(1, c.b * k + (r() - 0.5) * amount * 0.2),
  );
}

/** Applique une couleur unie à tous les sommets d'un mesh. */
export function paint(mesh: Mesh, color: Color3, alpha = 1): Mesh {
  const count = mesh.getTotalVertices();
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    colors[i * 4] = color.r;
    colors[i * 4 + 1] = color.g;
    colors[i * 4 + 2] = color.b;
    colors[i * 4 + 3] = alpha;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  return mesh;
}

/** Déforme aléatoirement les sommets (rochers, feuillages) en gardant les arêtes soudées. */
export function wobble(mesh: Mesh, amount: number, r: () => number): Mesh {
  const pos = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.length; i += 3) {
    const key = `${pos[i].toFixed(3)},${pos[i + 1].toFixed(3)},${pos[i + 2].toFixed(3)}`;
    let off = seen.get(key);
    if (!off) {
      off = [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount];
      seen.set(key, off);
    }
    pos[i] += off[0];
    pos[i + 1] += off[1];
    pos[i + 2] += off[2];
  }
  mesh.setVerticesData(VertexBuffer.PositionKind, pos);
  return mesh;
}

/** Place un mesh (position/rotation/échelle) puis fige sa transformation dans ses sommets. */
export function place(
  mesh: Mesh,
  p: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  s: [number, number, number] = [1, 1, 1],
): Mesh {
  mesh.position.set(...p);
  mesh.rotation.set(...rot);
  mesh.scaling.set(...s);
  mesh.bakeCurrentTransformIntoVertices();
  return mesh;
}

const matCache = new WeakMap<Scene, Map<string, StandardMaterial>>();

/** Matériau partagé qui affiche les couleurs de sommets, sans reflet plastique. */
export function vertexColorMaterial(scene: Scene, key = "vc", emissive?: Color3): StandardMaterial {
  let cache = matCache.get(scene);
  if (!cache) {
    cache = new Map();
    matCache.set(scene, cache);
  }
  const k = key + (emissive ? emissive.toHexString() : "");
  let m = cache.get(k);
  if (!m) {
    m = new StandardMaterial(k, scene);
    m.diffuseColor = Color3.White();
    m.specularColor = new Color3(0.04, 0.04, 0.04);
    m.specularPower = 16;
    if (emissive) m.emissiveColor = emissive;
    m.maxSimultaneousLights = 6;
    cache.set(k, m);
  }
  return m;
}

/** Fusionne des pièces colorées en un seul mesh à facettes. */
export function build(name: string, parts: Mesh[], scene: Scene, flat = true): Mesh {
  const merged = Mesh.MergeMeshes(parts, true, true)!;
  merged.name = name;
  if (flat) merged.convertToFlatShadedMesh();
  merged.material = vertexColorMaterial(scene);
  return merged;
}

/** Ajoute des copies GPU (thin instances) d'un mesh modèle. */
export function scatter(
  base: Mesh,
  items: Array<{ x: number; y: number; z: number; rot: number; scale: number; sy?: number }>,
): void {
  const buf = new Float32Array(items.length * 16);
  const m = new Matrix();
  const q = new Quaternion();
  items.forEach((it, i) => {
    Quaternion.RotationYawPitchRollToRef(it.rot, 0, 0, q);
    Matrix.ComposeToRef(
      new Vector3(it.scale, it.scale * (it.sy ?? 1), it.scale), q, new Vector3(it.x, it.y, it.z), m,
    );
    m.copyToArray(buf, i * 16);
  });
  base.thinInstanceSetBuffer("matrix", buf, 16, true);
  base.thinInstanceRefreshBoundingInfo(false);
  base.alwaysSelectAsActiveMesh = false;
}

/** Texture ronde et douce, générée en code, pour les particules. */
export function softDotTexture(scene: Scene, name = "dot", size = 64): Texture {
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.65)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export function c4(c: Color3, a = 1): Color4 {
  return new Color4(c.r, c.g, c.b, a);
}
