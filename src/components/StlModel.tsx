import type { LightState, LoadedModel, ValueMode } from "../types";
import { StudyMaterial } from "./StudyMaterial";

type StlModelProps = {
  model: LoadedModel | null;
  light: LightState;
  valueMode: ValueMode;
};

export function StlModel({ model, light, valueMode }: StlModelProps) {
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
      <StudyMaterial light={light} valueMode={valueMode} />
    </mesh>
  );
}
