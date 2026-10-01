import { DenoiseMaterial, WebGLPathTracer } from "three-gpu-pathtracer";
import { GenerateMeshBVHWorker } from "three-mesh-bvh/worker";
import { ShaderPass } from "postprocessing";
import { OrthographicCamera, type WebGLRenderer } from "three";

// DenoiseMaterial uses Three's camera-projected fullscreen convention. The
// postprocessing default near plane clips z=0; configure it through its
// protected API rather than modifying the library shader.
class DenoisePass extends ShaderPass {
  constructor() {
    super(new DenoiseMaterial({ sigma: 2, kSigma: 1, threshold: 0.1 }), "map");
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
}

export function createRefinement(gl: WebGLRenderer) {
  const tracer = new WebGLPathTracer(gl);
  const worker = new GenerateMeshBVHWorker();
  tracer.setBVHWorker(worker);
  tracer.bounces = 3;
  tracer.tiles.set(3, 3);
  tracer.renderDelay = 0;
  tracer.renderToCanvas = false;
  tracer.rasterizeScene = false;
  tracer.minSamples = 1;
  tracer.fadeDuration = 0;
  const denoise = new DenoisePass();
  denoise.enabled = false;
  return { tracer, worker, denoise };
}
