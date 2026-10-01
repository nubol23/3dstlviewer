/* eslint-disable react-hooks/immutability -- Three.js scene/renderer objects are imperative external resources, not React state. */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { N8AOPostPass } from "n8ao";
import { HalfFloatType, NoToneMapping } from "three";
import type { AppState } from "../types";
import { ValueStudyEffect } from "../lib/ValueStudyEffect";

export function StudyPipeline({ state, mobile }: { state: AppState; mobile: boolean }) {
  const { gl, scene, camera, size, invalidate } = useThree();
  const pipeline = useRef<{ composer: EffectComposer; values: ValueStudyEffect } | null>(null);
  useEffect(() => {
    gl.toneMapping = NoToneMapping;
    const composer = new EffectComposer(gl, { frameBufferType: HalfFloatType, multisampling: 0 });
    const ao = new N8AOPostPass(scene, camera, 1, 1);
    ao.setQualityMode(mobile ? "Low" : "Medium");
    ao.configuration.halfRes = true;
    ao.configuration.gammaCorrection = false;
    ao.configuration.aoRadius = 0.12;
    ao.configuration.intensity = 1.4;
    ao.configuration.distanceFalloff = 1;
    ao.configuration.accumulate = false;
    const values = new ValueStudyEffect();
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(ao);
    composer.addPass(new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX })));
    composer.addPass(new EffectPass(camera, values));
    pipeline.current = { composer, values };
    invalidate();
    return () => { pipeline.current = null; composer.dispose(); };
  }, [gl, scene, camera, mobile, invalidate]);
  useEffect(() => {
    pipeline.current?.composer.setSize(size.width, size.height);
    invalidate();
  }, [size, mobile, invalidate]);
  useEffect(() => {
    gl.toneMappingExposure = state.valueRamp.exposure;
    pipeline.current?.values.configure(state.valueRamp, state.renderStyle, state.valueStepCount);
    invalidate();
  }, [state, gl, invalidate, mobile]);
  useFrame((_, delta) => {
    if (document.hidden) return;
    const start = performance.now();
    pipeline.current?.composer.render(delta);
    performance.measure("study:raster-frame", { start, end: performance.now() });
    // Keep measurements bounded during long interactive sessions.
    if (performance.getEntriesByName("study:raster-frame").length > 600) performance.clearMeasures("study:raster-frame");
  }, 1);
  return null;
}
