import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BlendFunction, EffectComposer, EffectPass, RenderPass, TextureEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { N8AOPostPass } from "n8ao";
import { HalfFloatType, Matrix4, NoToneMapping } from "three";
import type { AppState } from "../types";
import type { createRefinement } from "../lib/RefinementEngine";
import { ValueStudyEffect } from "../lib/ValueStudyEffect";

export type RefinementStatus = { available: boolean; phase: "preview" | "preparing" | "compiling" | "sampling" | "done" | "error"; samples: number; progress: number; message?: string };
export type RefinementApi = { refine: () => void; stop: () => void };
type Session = ReturnType<typeof createRefinement>;
type Props = { state: AppState; mobile: boolean; onStatus: (status: RefinementStatus) => void };

export const StudyPipeline = forwardRef<RefinementApi, Props>(function StudyPipeline({ state, mobile, onStatus }, ref) {
  const { gl, scene, camera, size, invalidate } = useThree();
  const context = gl.getContext();
  const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
  const driver = debugInfo ? String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : "";
  const available = !mobile && gl.extensions.has("EXT_color_buffer_float") && !/SwiftShader|llvmpipe|software/i.test(driver);
  const pipeline = useRef<{ composer: EffectComposer; values: ValueStudyEffect; ao: N8AOPostPass; replacement: EffectPass; texture: TextureEffect } | null>(null);
  const session = useRef<Session | null>(null);
  const job = useRef({ id: 0, phase: "preview" as RefinementStatus["phase"], sampleStart: 0, preparedAt: 0, lastReport: 0, camera: new Matrix4(), projection: new Matrix4() });
  const statusCallback = useRef(onStatus);
  useEffect(() => { statusCallback.current = onStatus; }, [onStatus]);

  function report(phase: RefinementStatus["phase"], samples = 0, progress = 0, message?: string) {
    job.current.phase = phase;
    statusCallback.current({ available, phase, samples, progress, message });
  }
  function preview(dispose = false) {
    const preparing = job.current.phase === "preparing";
    job.current.id++;
    if ((dispose || preparing) && session.current) {
      pipeline.current?.composer.removePass(session.current.denoise);
      session.current.denoise.dispose();
      session.current.worker.dispose(); session.current.tracer.dispose(); session.current = null;
    }
    if (session.current) session.current.denoise.enabled = false;
    if (pipeline.current) { pipeline.current.replacement.enabled = false; pipeline.current.ao.enabled = true; }
    report("preview");
    invalidate();
  }
  async function refine() {
    if (!available || !state.model || job.current.phase === "preparing") return;
    const id = ++job.current.id;
    report("preparing");
    invalidate();
    // Give the UI a frame before the library's synchronous scene extraction.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    try {
      if (!session.current) {
        const { createRefinement } = await import("../lib/RefinementEngine");
        if (id !== job.current.id) return;
        const next = createRefinement(gl);
        session.current = next;
        pipeline.current?.composer.addPass(next.denoise, 3);
        const start = performance.now();
        await next.tracer.setSceneAsync(scene, camera, { onProgress: progress => {
          if (id === job.current.id) report("preparing", 0, progress);
        } });
        performance.measure("study:scene-bvh", { start, end: performance.now() });
      }
      if (id !== job.current.id || !session.current || !pipeline.current) return;
      const { tracer } = session.current;
      tracer.updateCamera(); tracer.updateLights(); tracer.updateMaterials(); tracer.updateEnvironment();
      tracer.renderScale = Math.min(1, 960 / (Math.max(size.width, size.height) * gl.getPixelRatio()));
      tracer.reset();
      job.current.camera.copy(camera.matrixWorld);
      job.current.projection.copy(camera.projectionMatrix);
      job.current.sampleStart = 0; job.current.preparedAt = performance.now();
      report("compiling");
      invalidate();
    } catch (error) {
      if (id !== job.current.id) return;
      preview(true);
      report("error", 0, 0, error instanceof Error ? error.message : String(error));
    }
  }
  useImperativeHandle(ref, () => ({ refine, stop: () => preview() }));

  useEffect(() => {
    const activeJob = job.current;
    gl.toneMapping = NoToneMapping;
    const composer = new EffectComposer(gl, { frameBufferType: HalfFloatType, multisampling: 0 });
    const ao = new N8AOPostPass(scene, camera, 1, 1);
    ao.setQualityMode(mobile ? "Low" : "Medium");
    ao.configuration.halfRes = true; ao.configuration.gammaCorrection = false;
    ao.configuration.aoRadius = 0.12; ao.configuration.intensity = 1.4;
    ao.configuration.distanceFalloff = 1; ao.configuration.accumulate = false;
    const values = new ValueStudyEffect();
    const texture = new TextureEffect({ blendFunction: BlendFunction.SRC });
    const replacement = new EffectPass(camera, texture);
    replacement.enabled = false;
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(ao);
    composer.addPass(replacement);
    composer.addPass(new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX })));
    composer.addPass(new EffectPass(camera, values));
    pipeline.current = { composer, values, ao, replacement, texture };
    invalidate();
    return () => {
      activeJob.id++;
      if (session.current) {
        composer.removePass(session.current.denoise); session.current.denoise.dispose();
        session.current.worker.dispose(); session.current.tracer.dispose(); session.current = null;
      }
      pipeline.current = null; composer.dispose();
    };
  }, [gl, scene, camera, mobile, invalidate]);
  useEffect(() => {
    pipeline.current?.composer.setSize(size.width, size.height);
    preview();
    // preview mutates renderer resources; its inputs are the resize/capability boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, mobile]);
  useEffect(() => {
    preview(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.model, state.light.reflector]);
  useEffect(() => {
    preview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.light, state.lightingMode, state.floor]);
  useEffect(() => {
    gl.toneMappingExposure = state.valueRamp.exposure;
    pipeline.current?.values.configure(state.valueRamp, state.renderStyle, state.valueStepCount);
    invalidate();
  }, [state.valueRamp, state.renderStyle, state.valueStepCount, gl, invalidate, mobile]);
  useFrame((_, delta) => {
    if (document.hidden) {
      if (job.current.phase === "sampling" || job.current.phase === "compiling") preview();
      return;
    }
    const resources = pipeline.current;
    if (!resources) return;
    const active = session.current;
    const phase = job.current.phase;
    if (active && ["sampling", "compiling", "done"].includes(phase)) {
      if (!camera.matrixWorld.equals(job.current.camera) || !camera.projectionMatrix.equals(job.current.projection)) { preview(); }
      else if (phase !== "done") {
        try {
          active.tracer.renderSample();
          const samples = active.tracer.samples;
          const now = performance.now();
          if (samples > 0) {
            if (!job.current.sampleStart) {
              job.current.sampleStart = now;
              performance.measure("study:first-sample", { start: job.current.preparedAt, end: now });
            }
            resources.texture.texture = active.tracer.target.texture;
            resources.replacement.enabled = true; resources.ao.enabled = false; active.denoise.enabled = true;
            const finished = samples >= 64 || now - job.current.sampleStart >= 5000;
            if (finished || now - job.current.lastReport > 150) {
              report(finished ? "done" : "sampling", samples);
              job.current.lastReport = now;
            }
            if (finished) performance.measure("study:refinement", { start: job.current.sampleStart, end: now });
          }
          if (job.current.phase !== "done") invalidate();
        } catch (error) {
          preview(true);
          report("error", 0, 0, error instanceof Error ? error.message : String(error));
        }
      }
    }
    const start = performance.now();
    resources.composer.render(delta);
    performance.measure("study:raster-frame", { start, end: performance.now() });
    if (performance.getEntriesByName("study:raster-frame").length > 600) performance.clearMeasures("study:raster-frame");
  }, 1);
  return null;
});
