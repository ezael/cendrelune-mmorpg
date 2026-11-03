import type { Mesh, ShadowGenerator, CascadedShadowGenerator, Vector3 } from "@babylonjs/core";
import type { ZoneId } from "../../shared/zones.js";
import type { Atmosphere } from "./atmosphere.js";
import type { Biome } from "./biomes.js";

/** Ce qu'une zone construite expose au reste du jeu. */
export interface ZoneWorld {
  zoneId: ZoneId;
  atmosphere?: Atmosphere;
  /** Ambiance utilisée pour construire la zone (zones extérieures). */
  biome?: Biome;
  /** Étalonnage de l'image propre à l'ambiance. */
  grade?: Biome["grade"];
  /** Lac gelé ou croûte de cendre : on marche dessus au lieu de patauger. */
  waterFloor?: number;
  waterArea?: { x: number; z: number; radius: number };
  shadows: ShadowGenerator | CascadedShadowGenerator | null;
  ground: Mesh;
  portalAnchors: Array<{ id: string; position: Vector3; label: string }>;
  update(dt: number, timeOfDay: number): void;
  dispose(): void;
}
