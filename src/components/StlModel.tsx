import { useEffect, useRef } from "react";
import type { BufferGeometry } from "three";
import {
  applyStudyBandsToGeometry,
  computeCleanStudyBands,
  ensureStudyBandAttribute,
  resetStudyBandAttribute,
} from "../lib/valueBandCleanup";
import type { LightState, LoadedModel, ValueMode, ValueRampState } from "../types";
import { StudyMaterial } from "./StudyMaterial";

type StlModelProps = {
  model: LoadedModel | null;
  light: LightState;
  valueMode: ValueMode;
  valueRamp: ValueRampState;
  zenithalStudy: boolean;
};

export function shouldCastPhysicalShadow(zenithalStudy: boolean): boolean {
  return !zenithalStudy;
}

export function shouldComputeCleanStudyBands(valueMode: ValueMode): boolean {
  return valueMode === "three-step" || valueMode === "five-step";
}

export function StlModel({ model, light, valueMode, valueRamp, zenithalStudy }: StlModelProps) {
  const previousGeometryRef = useRef<BufferGeometry | null>(null);
  const geometry = model?.geometry ?? null;
  const lightTarget = model?.fit.center ?? null;
  const bandBias = valueRamp.bandBias;

  useEffect(() => {
    const previousGeometry = previousGeometryRef.current;
    if (previousGeometry && previousGeometry !== geometry) {
      previousGeometry.dispose();
    }
    previousGeometryRef.current = geometry;
  }, [geometry]);

  useEffect(() => {
    if (!geometry || !lightTarget) {
      return;
    }

    if (!shouldComputeCleanStudyBands(valueMode)) {
      resetStudyBandAttribute(geometry);
      return;
    }

    ensureStudyBandAttribute(geometry);

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      void Promise.resolve(
        computeCleanStudyBands({
          geometry,
          light,
          lightTarget,
          valueMode,
          valueRamp: { bandBias },
          zenithalStudy,
        }),
      ).then((bands) => {
        if (!cancelled && bands) {
          applyStudyBandsToGeometry(geometry, bands);
        }
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [geometry, light, lightTarget, valueMode, bandBias, zenithalStudy]);

  if (!model) {
    return null;
  }

  return (
    <mesh
      key={model.id}
      geometry={model.geometry}
      castShadow={shouldCastPhysicalShadow(zenithalStudy)}
      receiveShadow
      data-testid="stl-model"
      userData={{
        fileName: model.metadata.fileName,
        triangles: model.metadata.triangleCount,
      }}
    >
      <StudyMaterial
        light={light}
        lightTarget={model.fit.center}
        valueMode={valueMode}
        valueRamp={valueRamp}
        zenithalStudy={zenithalStudy}
      />
    </mesh>
  );
}
