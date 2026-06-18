import { BufferAttribute, BufferGeometry, Vector3 } from "three";

import type { LightState, ValueMode, ValueRampState } from "../types";
import { MIN_TRIANGLE_AREA } from "./geometry";
import { lightPoseFromState } from "./light";
import { getValueModeDescriptor } from "./valueMode";

export const STUDY_BAND_SENTINEL = -1;
export const DEFAULT_HARD_NORMAL_THRESHOLD_DEG = 35;
export const DEFAULT_TINY_COMPONENT_MAX_TRIANGLES = 2;
export const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.35;
export const DEFAULT_COMPATIBLE_BAND_DISTANCE = 1;

const RAD_TO_DEG = 180 / Math.PI;
const ZENITHAL_RING_DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0.707107, 0.707107],
  [0.353553, 0.707107, 0.612372],
  [0.612372, 0.707107, 0.353553],
  [0.707107, 0.707107, 0],
  [0.612372, 0.707107, -0.353553],
  [0.353553, 0.707107, -0.612372],
  [0, 0.707107, -0.707107],
  [-0.353553, 0.707107, -0.612372],
  [-0.612372, 0.707107, -0.353553],
  [-0.707107, 0.707107, 0],
  [-0.612372, 0.707107, 0.353553],
  [-0.353553, 0.707107, 0.612372],
];

type TriangleEdge = 0 | 1 | 2;
type StepCount = 1 | 3 | 5;
export type QuantizedStepCount = Exclude<StepCount, 1>;

export type TriangleGraph = {
  triangleCount: number;
  neighbors: Int32Array;
  openEdges: Uint8Array;
  groupIndices: Int32Array;
  normals: Float32Array;
  centroids: Float32Array;
  blockedEdges: Array<{
    reason: "open" | "non-manifold" | "group" | "hard-normal";
    triangles: number[];
    edges: TriangleEdge[];
    angleDeg?: number;
  }>;
};

export type BandCleanupInput = {
  bands: Int8Array;
  locked: Uint8Array;
  lowConfidence: Uint8Array;
  stepCount: QuantizedStepCount;
};

export type ComputeCleanStudyBandsInput = {
  geometry: BufferGeometry;
  light: LightState;
  lightTarget: Vector3;
  valueMode: ValueMode;
  valueRamp: Pick<ValueRampState, "bandBias">;
  zenithalStudy: boolean;
};

export type ValueBandCleanupOptions = {
  hardNormalThresholdDeg?: number;
  maxTinyComponentTriangles?: number;
  lowConfidenceThreshold?: number;
  compatibleBandDistance?: number;
};

export type CleanedStudyBandResult = {
  graph: TriangleGraph;
  values: Float32Array;
  bands: Int8Array;
  lowConfidence: Uint8Array;
  cleanedBands: Int8Array;
  overrideBands: Int8Array;
};

type EdgeUse = {
  triangle: number;
  edge: TriangleEdge;
  groupIndex: number;
};

type BandComponent = {
  index: number;
  band: number;
  triangles: number[];
  isLowConfidence: boolean;
  isLocked: boolean;
  hasOpenBoundary: boolean;
};

function failFastFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid value band cleanup ${label}: ${String(value)}`);
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  failFastFinite(value, "numeric value");
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function mix(a: number, b: number, ratio: number): number {
  return a * (1 - ratio) + b * ratio;
}

function getPositionAttribute(geometry: BufferGeometry): BufferAttribute {
  const position = geometry.getAttribute("position");
  if (!(position instanceof BufferAttribute)) {
    throw new Error("Invalid value band cleanup geometry: missing non-interleaved position attribute");
  }
  if (position.itemSize !== 3) {
    throw new Error("Invalid value band cleanup geometry: position attribute must have itemSize 3");
  }
  if (position.count <= 0 || position.count % 3 !== 0) {
    throw new Error(
      `Invalid value band cleanup geometry: position count (${position.count}) must be a positive multiple of 3`,
    );
  }
  return position;
}

function assertNonIndexedGeometry(geometry: BufferGeometry): BufferAttribute {
  if (!geometry || !("isBufferGeometry" in geometry)) {
    throw new Error("Invalid value band cleanup geometry: expected BufferGeometry");
  }
  if (geometry.index) {
    throw new Error("Invalid value band cleanup geometry: expected non-indexed triangles");
  }
  return getPositionAttribute(geometry);
}

function normalizeHardNormalThreshold(options: ValueBandCleanupOptions): number {
  const threshold = options.hardNormalThresholdDeg ?? DEFAULT_HARD_NORMAL_THRESHOLD_DEG;
  failFastFinite(threshold, "hard normal threshold");
  if (threshold < 0 || threshold > 180) {
    throw new Error(`Invalid value band cleanup hard normal threshold: ${threshold} is outside 0..180`);
  }
  return threshold;
}

function canonicalCoordinate(value: number): string {
  failFastFinite(value, "position coordinate");
  return String(Object.is(value, -0) ? 0 : value);
}

function vertexKey(position: BufferAttribute, vertexIndex: number): string {
  return [
    canonicalCoordinate(position.getX(vertexIndex)),
    canonicalCoordinate(position.getY(vertexIndex)),
    canonicalCoordinate(position.getZ(vertexIndex)),
  ].join(",");
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function createGroupIndices(geometry: BufferGeometry, triangleCount: number): Int32Array {
  const groupIndices = new Int32Array(triangleCount);
  if (geometry.groups.length === 0) {
    return groupIndices;
  }

  const sortedGroups = [...geometry.groups].sort((a, b) => a.start - b.start);
  let expectedStart = 0;
  sortedGroups.forEach((group, groupIndex) => {
    if (!Number.isInteger(group.start) || !Number.isInteger(group.count)) {
      throw new Error(`Invalid value band cleanup geometry group ${groupIndex}: range must be integer`);
    }
    if (group.start < 0 || group.count <= 0) {
      throw new Error(`Invalid value band cleanup geometry group ${groupIndex}: range is empty`);
    }
    if (group.start % 3 !== 0 || group.count % 3 !== 0) {
      throw new Error(`Invalid value band cleanup geometry group ${groupIndex}: range must align to triangles`);
    }
    if (group.start !== expectedStart) {
      throw new Error(`Invalid value band cleanup geometry group ${groupIndex}: groups must be contiguous`);
    }

    const groupEnd = group.start + group.count;
    if (groupEnd > triangleCount * 3) {
      throw new Error(`Invalid value band cleanup geometry group ${groupIndex}: range exceeds geometry`);
    }

    for (let vertex = group.start; vertex < groupEnd; vertex += 3) {
      groupIndices[vertex / 3] = groupIndex;
    }
    expectedStart = groupEnd;
  });

  if (expectedStart !== triangleCount * 3) {
    throw new Error("Invalid value band cleanup geometry: groups do not cover every triangle");
  }

  return groupIndices;
}

function computeTriangleFrames(position: BufferAttribute, triangleCount: number): {
  normals: Float32Array;
  centroids: Float32Array;
} {
  const normals = new Float32Array(triangleCount * 3);
  const centroids = new Float32Array(triangleCount * 3);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  const normal = new Vector3();

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const vertexOffset = triangle * 3;
    a.fromBufferAttribute(position, vertexOffset);
    b.fromBufferAttribute(position, vertexOffset + 1);
    c.fromBufferAttribute(position, vertexOffset + 2);
    [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z].forEach((value, index) => {
      failFastFinite(value, `triangle ${triangle} coordinate ${index}`);
    });

    ab.subVectors(b, a);
    ac.subVectors(c, a);
    normal.crossVectors(ab, ac);
    const doubledArea = normal.length();
    if (!Number.isFinite(doubledArea) || doubledArea / 2 <= MIN_TRIANGLE_AREA) {
      throw new Error(`Invalid value band cleanup geometry: triangle ${triangle} has zero or near-zero area`);
    }
    normal.divideScalar(doubledArea);

    const offset = triangle * 3;
    normals[offset] = normal.x;
    normals[offset + 1] = normal.y;
    normals[offset + 2] = normal.z;
    centroids[offset] = (a.x + b.x + c.x) / 3;
    centroids[offset + 1] = (a.y + b.y + c.y) / 3;
    centroids[offset + 2] = (a.z + b.z + c.z) / 3;
  }

  return { normals, centroids };
}

function triangleVector(values: Float32Array, triangle: number, target: Vector3): Vector3 {
  const offset = triangle * 3;
  return target.set(values[offset], values[offset + 1], values[offset + 2]);
}

function addNeighbor(neighbors: Int32Array, a: EdgeUse, b: EdgeUse): void {
  neighbors[a.triangle * 3 + a.edge] = b.triangle;
  neighbors[b.triangle * 3 + b.edge] = a.triangle;
}

export function buildTriangleGraph(
  geometry: BufferGeometry,
  options: ValueBandCleanupOptions = {},
): TriangleGraph {
  const position = assertNonIndexedGeometry(geometry);
  const triangleCount = position.count / 3;
  const groupIndices = createGroupIndices(geometry, triangleCount);
  const { normals, centroids } = computeTriangleFrames(position, triangleCount);
  const hardNormalThresholdDeg = normalizeHardNormalThreshold(options);
  const hardNormalCos = Math.cos((hardNormalThresholdDeg * Math.PI) / 180);
  const edgeUses = new Map<string, EdgeUse[]>();
  const neighbors = new Int32Array(triangleCount * 3);
  const openEdges = new Uint8Array(triangleCount * 3);
  const blockedEdges: TriangleGraph["blockedEdges"] = [];
  const normalA = new Vector3();
  const normalB = new Vector3();
  neighbors.fill(STUDY_BAND_SENTINEL);

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const vertexOffset = triangle * 3;
    const keys = [
      vertexKey(position, vertexOffset),
      vertexKey(position, vertexOffset + 1),
      vertexKey(position, vertexOffset + 2),
    ];
    const edges: Array<readonly [number, number, TriangleEdge]> = [
      [0, 1, 0],
      [1, 2, 1],
      [2, 0, 2],
    ];

    edges.forEach(([start, end, edge]) => {
      const key = edgeKey(keys[start], keys[end]);
      const uses = edgeUses.get(key) ?? [];
      uses.push({ triangle, edge, groupIndex: groupIndices[triangle] });
      edgeUses.set(key, uses);
    });
  }

  edgeUses.forEach((uses) => {
    if (uses.length === 1) {
      const [use] = uses;
      openEdges[use.triangle * 3 + use.edge] = 1;
      blockedEdges.push({ reason: "open", triangles: [use.triangle], edges: [use.edge] });
      return;
    }

    if (uses.length > 2) {
      blockedEdges.push({
        reason: "non-manifold",
        triangles: uses.map((use) => use.triangle),
        edges: uses.map((use) => use.edge),
      });
      return;
    }

    const [a, b] = uses;
    if (a.groupIndex !== b.groupIndex) {
      blockedEdges.push({ reason: "group", triangles: [a.triangle, b.triangle], edges: [a.edge, b.edge] });
      return;
    }

    const dot = clamp(
      triangleVector(normals, a.triangle, normalA).dot(triangleVector(normals, b.triangle, normalB)),
      -1,
      1,
    );
    if (dot < hardNormalCos) {
      blockedEdges.push({
        reason: "hard-normal",
        triangles: [a.triangle, b.triangle],
        edges: [a.edge, b.edge],
        angleDeg: Math.acos(dot) * RAD_TO_DEG,
      });
      return;
    }

    addNeighbor(neighbors, a, b);
  });

  return {
    triangleCount,
    neighbors,
    openEdges,
    groupIndices,
    normals,
    centroids,
    blockedEdges,
  };
}

export function quantizeStudyBand(value: number, stepCount: QuantizedStepCount): number {
  if (stepCount !== 3 && stepCount !== 5) {
    throw new Error(`Invalid value band cleanup step count: ${String(stepCount)}`);
  }

  return Math.min(stepCount - 1, Math.max(0, Math.floor(clamp01(value) * stepCount)));
}

export const quantizeStudyValueToBand = quantizeStudyBand;

function computeBandConfidence(value: number, stepCount: QuantizedStepCount): number {
  const clampedValue = clamp01(value);
  if (clampedValue === 0 || clampedValue === 1) {
    return 1;
  }

  let nearestBoundaryDistance = Number.POSITIVE_INFINITY;
  for (let boundary = 1; boundary < stepCount; boundary += 1) {
    nearestBoundaryDistance = Math.min(nearestBoundaryDistance, Math.abs(clampedValue - boundary / stepCount));
  }

  return clamp01(nearestBoundaryDistance / (0.5 / stepCount));
}

function validateBandCleanupInput(graph: TriangleGraph, input: BandCleanupInput): void {
  if (input.stepCount !== 3 && input.stepCount !== 5) {
    throw new Error(`Invalid value band cleanup step count: ${String(input.stepCount)}`);
  }
  if (input.bands.length !== graph.triangleCount) {
    throw new Error("Invalid value band cleanup input: band count does not match graph");
  }
  if (input.locked.length !== graph.triangleCount) {
    throw new Error("Invalid value band cleanup input: locked count does not match graph");
  }
  if (input.lowConfidence.length !== graph.triangleCount) {
    throw new Error("Invalid value band cleanup input: low-confidence count does not match graph");
  }

  for (let triangle = 0; triangle < graph.triangleCount; triangle += 1) {
    const band = input.bands[triangle];
    if (!Number.isInteger(band) || band < 0 || band >= input.stepCount) {
      throw new Error(`Invalid value band cleanup band for triangle ${triangle}: ${String(band)}`);
    }
  }
}

function buildComponents(graph: TriangleGraph, input: BandCleanupInput): {
  components: BandComponent[];
  componentByTriangle: Int32Array;
} {
  const componentByTriangle = new Int32Array(graph.triangleCount);
  componentByTriangle.fill(STUDY_BAND_SENTINEL);
  const components: BandComponent[] = [];

  for (let seed = 0; seed < graph.triangleCount; seed += 1) {
    if (componentByTriangle[seed] !== STUDY_BAND_SENTINEL) {
      continue;
    }

    const componentIndex = components.length;
    const band = input.bands[seed];
    const stack = [seed];
    const triangles: number[] = [];
    let lowConfidenceCount = 0;
    let isLocked = false;
    let hasOpenBoundary = false;
    componentByTriangle[seed] = componentIndex;

    while (stack.length > 0) {
      const triangle = stack.pop();
      if (triangle === undefined) {
        throw new Error("Invalid value band cleanup traversal state");
      }

      triangles.push(triangle);
      lowConfidenceCount += input.lowConfidence[triangle] ? 1 : 0;
      isLocked ||= Boolean(input.locked[triangle]);
      for (let edge = 0; edge < 3; edge += 1) {
        const edgeIndex = triangle * 3 + edge;
        hasOpenBoundary ||= Boolean(graph.openEdges[edgeIndex]);
        const neighbor = graph.neighbors[edgeIndex];
        if (
          neighbor < 0 ||
          componentByTriangle[neighbor] !== STUDY_BAND_SENTINEL ||
          input.bands[neighbor] !== band
        ) {
          continue;
        }
        componentByTriangle[neighbor] = componentIndex;
        stack.push(neighbor);
      }
    }

    components.push({
      index: componentIndex,
      band,
      triangles,
      isLowConfidence: lowConfidenceCount / triangles.length >= 0.5,
      isLocked,
      hasOpenBoundary,
    });
  }

  return { components, componentByTriangle };
}

function chooseDominantNeighborBand(
  graph: TriangleGraph,
  component: BandComponent,
  componentByTriangle: Int32Array,
  components: BandComponent[],
  compatibleBandDistance: number,
): number | null {
  const counts = new Map<number, number>();
  component.triangles.forEach((triangle) => {
    for (let edge = 0; edge < 3; edge += 1) {
      const neighbor = graph.neighbors[triangle * 3 + edge];
      if (neighbor < 0) {
        continue;
      }
      const neighborComponentIndex = componentByTriangle[neighbor];
      if (neighborComponentIndex === component.index) {
        continue;
      }
      const neighborBand = components[neighborComponentIndex].band;
      if (Math.abs(neighborBand - component.band) > compatibleBandDistance) {
        continue;
      }
      counts.set(neighborBand, (counts.get(neighborBand) ?? 0) + 1);
    }
  });

  let dominantBand: number | null = null;
  let dominantCount = -1;
  counts.forEach((count, band) => {
    if (count > dominantCount) {
      dominantBand = band;
      dominantCount = count;
    }
  });

  return dominantBand;
}

export function cleanupBandIslands(
  graph: TriangleGraph,
  input: BandCleanupInput,
  options: ValueBandCleanupOptions = {},
): Int8Array {
  validateBandCleanupInput(graph, input);
  const maxTinyComponentTriangles = options.maxTinyComponentTriangles ?? DEFAULT_TINY_COMPONENT_MAX_TRIANGLES;
  const compatibleBandDistance = options.compatibleBandDistance ?? DEFAULT_COMPATIBLE_BAND_DISTANCE;
  if (!Number.isSafeInteger(maxTinyComponentTriangles) || maxTinyComponentTriangles < 1) {
    throw new Error(`Invalid value band cleanup tiny component limit: ${String(maxTinyComponentTriangles)}`);
  }
  if (!Number.isSafeInteger(compatibleBandDistance) || compatibleBandDistance < 0) {
    throw new Error(`Invalid value band cleanup compatible band distance: ${String(compatibleBandDistance)}`);
  }

  const output = Int8Array.from(input.bands);
  const { components, componentByTriangle } = buildComponents(graph, input);

  components.forEach((component) => {
    if (
      component.triangles.length > maxTinyComponentTriangles ||
      !component.isLowConfidence ||
      component.isLocked ||
      component.hasOpenBoundary
    ) {
      return;
    }

    const targetBand = chooseDominantNeighborBand(
      graph,
      component,
      componentByTriangle,
      components,
      compatibleBandDistance,
    );
    if (targetBand === null || targetBand === component.band) {
      return;
    }

    component.triangles.forEach((triangle) => {
      output[triangle] = targetBand;
    });
  });

  return output;
}

function normalizeLightDirection(lightDirection: Vector3): Vector3 {
  failFastFinite(lightDirection.x, "light direction x");
  failFastFinite(lightDirection.y, "light direction y");
  failFastFinite(lightDirection.z, "light direction z");
  const normalized = lightDirection.clone();
  const length = normalized.length();
  return length === 0 ? normalized.set(0, 1, 0) : normalized.divideScalar(length);
}

function getStudyBounce(
  normal: Vector3,
  position: Vector3,
  direct: number,
  bounceStrength: number,
  floorY: number,
  floorFalloff: number,
): number {
  const downFacing = clamp(-normal.y, 0, 1);
  const floorLift = 2 ** (-Math.abs(position.y - floorY) / Math.max(floorFalloff, 0.0001));
  return (
    bounceStrength *
    (0.12 + 0.38 * (1 - direct)) *
    (0.35 + 0.65 * downFacing) *
    mix(0.35, 1, floorLift)
  );
}

function computeDirectionalStudyValue(
  normal: Vector3,
  position: Vector3,
  lightDirection: Vector3,
  keyStrength: number,
  bounceStrength: number,
): number {
  const direct = clamp(normal.dot(lightDirection.clone().negate()), 0, 1);
  const key = direct * clamp(keyStrength, 0, 2.5) * 0.82;
  const bounce = getStudyBounce(normal, position, direct, bounceStrength, 0, 1);
  return clamp01(0.08 + key + bounce);
}

function computeZenithalRing(normal: Vector3): number {
  let ring = 0;
  ZENITHAL_RING_DIRECTIONS.forEach(([x, y, z]) => {
    ring += clamp(normal.x * x + normal.y * y + normal.z * z, 0, 1);
  });
  return ring / ZENITHAL_RING_DIRECTIONS.length;
}

function computeZenithalStudyValue(
  normal: Vector3,
  position: Vector3,
  keyStrength: number,
  bounceStrength: number,
): number {
  const ring = computeZenithalRing(normal);
  const overhead = clamp(normal.y, 0, 1) * 0.16;
  const key = ring * clamp(keyStrength, 0, 2.5) * 0.74;
  const bounce = getStudyBounce(normal, position, ring, bounceStrength, 0, 1) * 0.72;
  return clamp01(0.1 + key + overhead + bounce);
}

function computeRawBands(
  graph: TriangleGraph,
  input: ComputeCleanStudyBandsInput,
  stepCount: QuantizedStepCount,
): Pick<CleanedStudyBandResult, "values" | "bands" | "lowConfidence"> {
  const values = new Float32Array(graph.triangleCount);
  const bands = new Int8Array(graph.triangleCount);
  const lowConfidence = new Uint8Array(graph.triangleCount);
  const lightDirection = normalizeLightDirection(lightPoseFromState(input.light, input.lightTarget).direction);
  const normal = new Vector3();
  const centroid = new Vector3();

  for (let triangle = 0; triangle < graph.triangleCount; triangle += 1) {
    triangleVector(graph.normals, triangle, normal);
    triangleVector(graph.centroids, triangle, centroid);
    const value = input.zenithalStudy
      ? computeZenithalStudyValue(normal, centroid, input.light.intensity, input.light.bounceStrength)
      : computeDirectionalStudyValue(normal, centroid, lightDirection, input.light.intensity, input.light.bounceStrength);
    const biasedValue = clamp01(value + input.valueRamp.bandBias);

    values[triangle] = value;
    bands[triangle] = quantizeStudyBand(biasedValue, stepCount);
    lowConfidence[triangle] = computeBandConfidence(biasedValue, stepCount) <= DEFAULT_LOW_CONFIDENCE_THRESHOLD ? 1 : 0;
  }

  return { values, bands, lowConfidence };
}

export function computeCleanedStudyBands(
  input: ComputeCleanStudyBandsInput,
  options: ValueBandCleanupOptions = {},
): CleanedStudyBandResult | null {
  const descriptor = getValueModeDescriptor(input.valueMode);
  if (descriptor.stepCount === 1) {
    return null;
  }

  const graph = buildTriangleGraph(input.geometry, options);
  const labels = computeRawBands(graph, input, descriptor.stepCount);
  const cleanedBands = cleanupBandIslands(
    graph,
    {
      bands: labels.bands,
      locked: new Uint8Array(graph.triangleCount),
      lowConfidence: labels.lowConfidence,
      stepCount: descriptor.stepCount,
    },
    options,
  );
  const overrideBands = new Int8Array(graph.triangleCount);
  overrideBands.fill(STUDY_BAND_SENTINEL);
  for (let triangle = 0; triangle < graph.triangleCount; triangle += 1) {
    if (cleanedBands[triangle] !== labels.bands[triangle]) {
      overrideBands[triangle] = cleanedBands[triangle];
    }
  }

  return {
    graph,
    ...labels,
    cleanedBands,
    overrideBands,
  };
}

export function computeCleanStudyBands(
  input: ComputeCleanStudyBandsInput,
  options: ValueBandCleanupOptions = {},
): Int8Array | null {
  return computeCleanedStudyBands(input, options)?.overrideBands ?? null;
}

export function expandTriangleBandsToStudyBandAttribute(
  triangleBands: ArrayLike<number>,
  sentinel = STUDY_BAND_SENTINEL,
): BufferAttribute {
  failFastFinite(sentinel, "study band sentinel");
  const vertexBands = new Float32Array(triangleBands.length * 3);
  for (let triangle = 0; triangle < triangleBands.length; triangle += 1) {
    const band = triangleBands[triangle];
    failFastFinite(band, `triangle ${triangle} study band`);
    const vertexOffset = triangle * 3;
    vertexBands[vertexOffset] = band === sentinel ? sentinel : band;
    vertexBands[vertexOffset + 1] = band === sentinel ? sentinel : band;
    vertexBands[vertexOffset + 2] = band === sentinel ? sentinel : band;
  }
  return new BufferAttribute(vertexBands, 1);
}

export function ensureStudyBandAttribute(geometry: BufferGeometry): BufferAttribute {
  const position = assertNonIndexedGeometry(geometry);
  const existing = geometry.getAttribute("studyBand");
  if (existing) {
    if (!(existing instanceof BufferAttribute)) {
      throw new Error("Invalid value band cleanup geometry: studyBand attribute must be non-interleaved");
    }
    if (existing.itemSize !== 1) {
      throw new Error("Invalid value band cleanup geometry: studyBand attribute must have itemSize 1");
    }
    if (existing.count !== position.count) {
      throw new Error("Invalid value band cleanup geometry: studyBand attribute count does not match positions");
    }
    return existing;
  }

  const attribute = new BufferAttribute(new Float32Array(position.count).fill(STUDY_BAND_SENTINEL), 1);
  geometry.setAttribute("studyBand", attribute);
  return attribute;
}

export function applyStudyBandsToGeometry(
  geometry: BufferGeometry,
  triangleBands: ArrayLike<number>,
): BufferAttribute {
  const position = assertNonIndexedGeometry(geometry);
  const triangleCount = position.count / 3;
  if (triangleBands.length !== triangleCount) {
    throw new Error(`Invalid value band cleanup study bands: expected ${triangleCount}, got ${triangleBands.length}`);
  }

  const attribute = ensureStudyBandAttribute(geometry);
  const values = attribute.array;
  for (let triangle = 0; triangle < triangleBands.length; triangle += 1) {
    const band = triangleBands[triangle];
    failFastFinite(band, `triangle ${triangle} study band`);
    const vertexOffset = triangle * 3;
    values[vertexOffset] = band;
    values[vertexOffset + 1] = band;
    values[vertexOffset + 2] = band;
  }
  attribute.needsUpdate = true;
  return attribute;
}

export function resetStudyBandAttribute(geometry: BufferGeometry): BufferAttribute {
  const attribute = ensureStudyBandAttribute(geometry);
  attribute.array.fill(STUDY_BAND_SENTINEL);
  attribute.needsUpdate = true;
  return attribute;
}
