import type { ModelFitState, FloorState } from "../types";

type FloorProps = {
  floor: FloorState;
  modelFit: ModelFitState | null;
};

export function Floor({ floor, modelFit }: FloorProps) {
  const size = Math.max(9, (modelFit?.radius ?? 2) * 5.5);

  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} data-testid="study-floor">
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={floor.color} roughness={floor.roughness} metalness={0} />
    </mesh>
  );
}
