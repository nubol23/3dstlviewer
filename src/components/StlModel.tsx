import { useEffect, useRef } from "react";
import type { BufferGeometry } from "three";
import type { LightState, LoadedModel, ValueMode } from "../types";
import { StudyMaterial } from "./StudyMaterial";

type StlModelProps = {
  model: LoadedModel | null;
  light: LightState;
  valueMode: ValueMode;
};

export function StlModel({ model, light, valueMode }: StlModelProps) {
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
      castShadow
      receiveShadow
      data-testid="stl-model"
      userData={{
        fileName: model.metadata.fileName,
        triangles: model.metadata.triangleCount,
      }}
    >
      <StudyMaterial light={light} lightTarget={model.fit.center} valueMode={valueMode} />
    </mesh>
  );
}
