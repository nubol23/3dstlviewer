import { useEffect, useMemo, useRef } from "react";
import type { BufferGeometry } from "three";

import {
  applyStudyBandsToGeometry,
  createStudyBandComputationSettings,
  resetStudyBandAttribute,
} from "../lib/valueBandCleanup";
import {
  BandRequestSupersededError,
  ValueBandWorkerClient,
} from "../lib/valueBandWorkerClient";
import type {
  LightingMode,
  LightState,
  LoadedModel,
  ValueRampState,
  ValueRenderStyle,
  ValueStepCount,
} from "../types";
import { StudyMaterial } from "./StudyMaterial";

export const CLEAN_BAND_TRIANGLE_LIMIT = 200_000;

export type BandProcessingStatus = "idle" | "updating" | "clean" | "fast" | "error";

type StlModelProps = {
  model: LoadedModel | null;
  light: LightState;
  renderStyle: ValueRenderStyle;
  valueStepCount: ValueStepCount;
  valueRamp: ValueRampState;
  lightingMode: LightingMode;
  onBandStatusChange?: (status: BandProcessingStatus) => void;
};

export function shouldCastPhysicalShadow(): boolean {
  return true;
}

export function shouldUseCleanBandWorker(
  renderStyle: ValueRenderStyle,
  triangleCount: number,
): boolean {
  return renderStyle === "stepped" && triangleCount <= CLEAN_BAND_TRIANGLE_LIMIT;
}

export function StlModel({
  model,
  light,
  renderStyle,
  valueStepCount,
  valueRamp,
  lightingMode,
  onBandStatusChange,
}: StlModelProps) {
  const previousGeometryRef = useRef<BufferGeometry | null>(null);
  const workerClientRef = useRef<{
    geometry: BufferGeometry;
    client: ValueBandWorkerClient;
  } | null>(null);
  const cleanBandsAppliedRef = useRef(false);
  const geometry = model?.geometry ?? null;
  const triangleCount = model?.metadata.triangleCount ?? 0;
  const lightTarget = model?.fit.center ?? null;
  const bandLight = useMemo<LightState>(
    () => ({
      azimuthDeg: light.azimuthDeg,
      elevationDeg: light.elevationDeg,
      distance: 1,
      intensity: light.intensity,
      bounceStrength: light.bounceStrength,
      shadowSoftness: 0,
      locked: false,
    }),
    [
      light.azimuthDeg,
      light.bounceStrength,
      light.elevationDeg,
      light.intensity,
    ],
  );

  useEffect(() => {
    const previousGeometry = previousGeometryRef.current;
    if (previousGeometry && previousGeometry !== geometry) {
      previousGeometry.dispose();
    }
    previousGeometryRef.current = geometry;
    cleanBandsAppliedRef.current = false;
  }, [geometry]);

  useEffect(() => {
    return () => {
      const workerRecord = workerClientRef.current;
      if (workerRecord?.geometry === geometry) {
        workerRecord.client.dispose();
        workerClientRef.current = null;
      }
    };
  }, [geometry]);

  useEffect(() => {
    if (!geometry || !lightTarget) {
      onBandStatusChange?.("idle");
      return;
    }

    const clearAppliedCleanBands = () => {
      if (!cleanBandsAppliedRef.current) {
        return;
      }
      resetStudyBandAttribute(geometry);
      cleanBandsAppliedRef.current = false;
    };

    if (renderStyle === "smooth") {
      clearAppliedCleanBands();
      onBandStatusChange?.("idle");
      return;
    }

    clearAppliedCleanBands();

    if (!shouldUseCleanBandWorker(renderStyle, triangleCount)) {
      onBandStatusChange?.("fast");
      return;
    }

    let workerRecord = workerClientRef.current;
    if (!workerRecord || workerRecord.geometry !== geometry) {
      workerRecord?.client.dispose();
      try {
        workerRecord = {
          geometry,
          client: new ValueBandWorkerClient(geometry),
        };
      } catch {
        workerClientRef.current = null;
        onBandStatusChange?.("error");
        return;
      }
      workerClientRef.current = workerRecord;
    }

    let cancelled = false;
    onBandStatusChange?.("updating");
    const settings = createStudyBandComputationSettings({
      light: bandLight,
      lightTarget,
      stepCount: valueStepCount,
      valueRamp: { bandBias: valueRamp.bandBias },
      lightingMode,
    });

    void workerRecord.client
      .compute(settings)
      .then((bands) => {
        if (cancelled) {
          return;
        }
        applyStudyBandsToGeometry(geometry, bands);
        cleanBandsAppliedRef.current = true;
        onBandStatusChange?.("clean");
      })
      .catch((error: unknown) => {
        if (
          cancelled ||
          error instanceof BandRequestSupersededError ||
          (error instanceof Error && error.message === "Value band worker was disposed")
        ) {
          return;
        }
        if (workerClientRef.current?.client === workerRecord.client) {
          workerRecord.client.dispose();
          workerClientRef.current = null;
        }
        onBandStatusChange?.("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    geometry,
    bandLight,
    lightTarget,
    lightingMode,
    onBandStatusChange,
    renderStyle,
    triangleCount,
    valueRamp.bandBias,
    valueStepCount,
  ]);

  if (!model) {
    return null;
  }

  return (
    <mesh
      key={model.id}
      geometry={model.geometry}
      castShadow={shouldCastPhysicalShadow()}
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
        renderStyle={renderStyle}
        valueStepCount={valueStepCount}
        valueRamp={valueRamp}
        lightingMode={lightingMode}
      />
    </mesh>
  );
}
