import { BufferGeometry, Float32BufferAttribute } from "three";

export function createCubeGeometry(size = 1): BufferGeometry {
  const half = size / 2;

  const positions = new Float32Array([
    -half,
    -half,
    -half,
    half,
    half,
    half,
  ]);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}
