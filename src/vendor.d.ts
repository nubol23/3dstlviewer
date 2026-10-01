declare module "n8ao" {
  import { Pass } from "postprocessing";
  import type { Scene, Camera } from "three";
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width: number, height: number);
    configuration: { halfRes: boolean; gammaCorrection: boolean; aoRadius: number; intensity: number; distanceFalloff: number; accumulate: boolean };
    setQualityMode(mode: "Low" | "Medium"): void;
  }
}
