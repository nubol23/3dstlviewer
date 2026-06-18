import { useEffect, useRef } from "react";
import type { BufferGeometry } from "three";
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

export function StlModel({ model, light, valueMode, valueRamp, zenithalStudy }: StlModelProps) {
  const previousGeometryRef = useRef<BufferGeometry | null>(null);

  useEffect(() => {
    const currentGeometry = model?.geometry ?? null;
    const previousGeometry = previousGeometryRef.current;
    if (previousGeometry && previousGeometry !== currentGeometry) {
      previousGeometry.dispose();
    }
    previousGeometryRef.current = currentGeometry;
  }, [model?.geometry]);

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
