import { useEffect } from "react";
import type { LoadedModel } from "../types";

export function StlModel({ model }: { model: LoadedModel | null }) {
  const geometry = model?.geometry;
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!model) return null;
  return (
    <mesh geometry={model.geometry} castShadow receiveShadow userData={{ fileName: model.metadata.fileName, triangles: model.metadata.triangleCount }}>
      <meshPhysicalMaterial color="#bcbcbc" roughness={1} metalness={0} specularIntensity={0} />
    </mesh>
  );
}
