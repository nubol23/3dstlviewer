import { describe, expect, it } from "vitest";
import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";

import type { LightState } from "../types";
import {
  STUDY_BAND_SENTINEL,
  applyStudyBandsToGeometry,
  buildTriangleGraph,
  cleanupBandIslands,
  computeCleanStudyBands,
  ensureStudyBandAttribute,
  quantizeStudyBand,
  resetStudyBandAttribute,
  type BandCleanupInput,
} from "./valueBandCleanup";

function createGeometry(positions: number[], groups: Array<{ start: number; count: number }> = []): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  groups.forEach((group, materialIndex) => {
    geometry.addGroup(group.start, group.count, materialIndex);
  });
  return geometry;
}

function createCoplanarNeighborFan(): BufferGeometry {
  return createGeometry([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    1, 0, 0, 0, 0, 0, 0.5, -1, 0,
    0, 1, 0, 1, 0, 0, 1, 1, 0,
    0, 0, 0, 0, 1, 0, -1, 0.5, 0,
  ]);
}

const light: LightState = {
  azimuthDeg: 45,
  elevationDeg: 45,
  distance: 4,
  intensity: 1.2,
  bounceStrength: 0.25,
  shadowSoftness: 0.5,
  locked: false,
};

describe("value band triangle graph", () => {
  it("connects triangles across shared edges", () => {
    const geometry = createGeometry([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      1, 0, 0, 1, 1, 0, 0, 1, 0,
    ]);

    const graph = buildTriangleGraph(geometry);

    expect([...graph.neighbors].filter((neighbor) => neighbor >= 0)).toEqual([1, 0]);
  });

  it("does not connect triangles that only share a vertex", () => {
    const geometry = createGeometry([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, -1, 0, 0, 0, -1, 0,
    ]);

    const graph = buildTriangleGraph(geometry);

    expect([...graph.neighbors]).toEqual([-1, -1, -1, -1, -1, -1]);
  });

  it("blocks adjacency across hard normal breaks", () => {
    const geometry = createGeometry([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 0, 1, 1, 0, 0,
    ]);

    const graph = buildTriangleGraph(geometry);

    expect([...graph.neighbors]).toEqual([-1, -1, -1, -1, -1, -1]);
  });

  it("blocks adjacency across group boundaries", () => {
    const geometry = createGeometry(
      [
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        1, 0, 0, 1, 1, 0, 0, 1, 0,
      ],
      [
        { start: 0, count: 3 },
        { start: 3, count: 3 },
      ],
    );

    const graph = buildTriangleGraph(geometry);

    expect([...graph.neighbors]).toEqual([-1, -1, -1, -1, -1, -1]);
  });

  it("blocks adjacency on non-manifold edges", () => {
    const geometry = createGeometry([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      1, 0, 0, 0, 0, 0, 0.5, -1, 0,
      0, 0, 0, 1, 0, 0, 0.5, 0, 1,
    ]);

    const graph = buildTriangleGraph(geometry);

    expect(graph.neighbors[0]).toBe(-1);
    expect(graph.neighbors[3]).toBe(-1);
    expect(graph.neighbors[6]).toBe(-1);
  });
});

describe("value band cleanup", () => {
  it("merges a tiny low-confidence island into the dominant compatible neighbor band", () => {
    const graph = buildTriangleGraph(createCoplanarNeighborFan());
    const input: BandCleanupInput = {
      bands: new Int8Array([1, 0, 0, 0]),
      locked: new Uint8Array([0, 0, 0, 0]),
      lowConfidence: new Uint8Array([1, 0, 0, 0]),
      stepCount: 3,
    };

    expect([...cleanupBandIslands(graph, input)]).toEqual([0, 0, 0, 0]);
  });

  it("does not merge an island dominated by open boundaries", () => {
    const geometry = createGeometry([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      1, 0, 0, 0, 0, 0, 0.5, -1, 0,
    ]);
    const graph = buildTriangleGraph(geometry);
    const input: BandCleanupInput = {
      bands: new Int8Array([1, 0]),
      locked: new Uint8Array([0, 0]),
      lowConfidence: new Uint8Array([1, 0]),
      stepCount: 3,
    };

    expect([...cleanupBandIslands(graph, input)]).toEqual([1, 0]);
  });

  it("leaves shaded mode without study-band overrides", () => {
    const geometry = createCoplanarNeighborFan();

    expect(
      computeCleanStudyBands({
        geometry,
        light,
        lightTarget: new Vector3(0, 0, 0),
        valueMode: "shaded",
        valueRamp: { bandBias: 0 },
        zenithalStudy: false,
      }),
    ).toBeNull();
  });

  it("uses floor and clamp quantization for 3-step and 5-step modes", () => {
    expect(quantizeStudyBand(-0.2, 3)).toBe(0);
    expect(quantizeStudyBand(0.333, 3)).toBe(0);
    expect(quantizeStudyBand(0.334, 3)).toBe(1);
    expect(quantizeStudyBand(1, 3)).toBe(2);
    expect(quantizeStudyBand(0.199, 5)).toBe(0);
    expect(quantizeStudyBand(0.2, 5)).toBe(1);
    expect(quantizeStudyBand(1.2, 5)).toBe(4);
  });

  it("writes cleaned per-triangle bands as per-vertex geometry attributes", () => {
    const geometry = createGeometry([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      1, 0, 0, 1, 1, 0, 0, 1, 0,
    ]);

    const attribute = ensureStudyBandAttribute(geometry);
    expect(Array.from(attribute.array)).toEqual(Array(6).fill(STUDY_BAND_SENTINEL));

    applyStudyBandsToGeometry(geometry, new Int8Array([0, 2]));
    expect(Array.from(attribute.array)).toEqual([0, 0, 0, 2, 2, 2]);

    resetStudyBandAttribute(geometry);
    expect(Array.from(attribute.array)).toEqual(Array(6).fill(STUDY_BAND_SENTINEL));
  });
});
