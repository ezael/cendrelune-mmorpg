import type { Mesh, ShadowGenerator, CascadedShadowGenerator, Vector3 } from "@babylonjs/core";
import type { ZoneId } from "../../shared/zones.js";
import type { Atmosphere } from "./atmosphere.js";

/** Ce qu'une zone construite expose au reste du jeu. */
export interface ZoneWorld {
  zoneId: ZoneId;
  atmosphere?: Atmosphere;
  shadows: ShadowGenerator | CascadedShadowGenerator | null;
  ground: Mesh;
  portalAnchors: Array<{ id: string; position: Vector3; label: string }>;
  update(dt: number, timeOfDay: number): void;
  dispose(): void;
}
