import { BufferAttribute, BufferGeometry, Vector3 } from "three";

import type {
  LightingMode,
  LightState,
  ValueRenderStyle,
  ValueRampState,
  ValueStepCount,
} from "../types";
import { MIN_TRIANGLE_AREA } from "./geometry";
import { lightPoseFromState, resolveStudyLight } from "./light";
import { assertValueStepCount } from "./valueMode";

export const STUDY_BAND_SENTINEL = -1;
export const DEFAULT_HARD_NORMAL_THRESHOLD_DEG = 35;
export const DEFAULT_TINY_COMPONENT_MAX_TRIANGLES = 2;
export const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.35;
export const DEFAULT_COMPATIBLE_BAND_DISTANCE = 1;

const RAD_TO_DEG = 180 / Math.PI;
type TriangleEdge = 0 | 1 | 2;
export type QuantizedStepCount = ValueStepCount;

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
  renderStyle: ValueRenderStyle;
  stepCount: ValueStepCount;
  valueRamp: Pick<ValueRampState, "bandBias">;
  lightingMode: LightingMode;
};

export type ValueBandCleanupOptions = {
  hardNormalThresholdDeg?: number;
  maxTinyComponentTriangles?: number;
  lowConfidenceThreshold?: number;
  compatibleBandDistance?: number;
  collectBlockedEdges?: boolean;
};

export type CleanedStudyBandResult = {
  graph: TriangleGraph;
  values: Float32Array;
  bands: Int8Array;
  lowConfidence: Uint8Array;
  cleanedBands: Int8Array;
  overrideBands: Int8Array;
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

function addNeighbor(neighbors: Int32Array, edgeA: number, edgeB: number): void {
  neighbors[edgeA] = Math.floor(edgeB / 3);
  neighbors[edgeB] = Math.floor(edgeA / 3);
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
  const vertexIds = new Int32Array(position.count);
  const vertexIdByPosition = new Map<string, number>();
  const edgeUses = new Map<number, number>();
  const secondEdgeUses = new Int32Array(triangleCount * 3);
  const neighbors = new Int32Array(triangleCount * 3);
  const openEdges = new Uint8Array(triangleCount * 3);
  const blockedEdges: TriangleGraph["blockedEdges"] = [];
  const collectBlockedEdges = options.collectBlockedEdges ?? false;
  const normalA = new Vector3();
  const normalB = new Vector3();
  neighbors.fill(STUDY_BAND_SENTINEL);
  secondEdgeUses.fill(STUDY_BAND_SENTINEL);

  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const key = vertexKey(position, vertex);
    const existingId = vertexIdByPosition.get(key);
    if (existingId !== undefined) {
      vertexIds[vertex] = existingId;
      continue;
    }
    const vertexId = vertexIdByPosition.size;
    vertexIdByPosition.set(key, vertexId);
    vertexIds[vertex] = vertexId;
  }

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const vertexOffset = triangle * 3;
    const triangleVertexIds = [
      vertexIds[vertexOffset],
      vertexIds[vertexOffset + 1],
      vertexIds[vertexOffset + 2],
    ];
    const edges: Array<readonly [number, number]> = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];

    edges.forEach(([start, end], edge) => {
      const vertexA = triangleVertexIds[start];
      const vertexB = triangleVertexIds[end];
      const minVertex = Math.min(vertexA, vertexB);
      const maxVertex = Math.max(vertexA, vertexB);
      const edgeKey = minVertex * position.count + maxVertex;
      const edgeIndex = triangle * 3 + edge;
      const firstEdgeIndex = edgeUses.get(edgeKey);

      if (firstEdgeIndex === undefined) {
        edgeUses.set(edgeKey, edgeIndex);
        return;
      }

      if (secondEdgeUses[firstEdgeIndex] !== STUDY_BAND_SENTINEL) {
        const secondEdgeIndex = secondEdgeUses[firstEdgeIndex];
        if (secondEdgeIndex >= 0) {
          neighbors[firstEdgeIndex] = STUDY_BAND_SENTINEL;
          neighbors[secondEdgeIndex] = STUDY_BAND_SENTINEL;
        }
        secondEdgeUses[firstEdgeIndex] = -2;
        if (collectBlockedEdges) {
          blockedEdges.push({
            reason: "non-manifold",
            triangles: [Math.floor(firstEdgeIndex / 3), Math.floor(edgeIndex / 3)],
            edges: [(firstEdgeIndex % 3) as TriangleEdge, (edgeIndex % 3) as TriangleEdge],
          });
        }
        return;
      }

      secondEdgeUses[firstEdgeIndex] = edgeIndex;
      const triangleA = Math.floor(firstEdgeIndex / 3);
      const triangleB = triangle;
      const edgeA = (firstEdgeIndex % 3) as TriangleEdge;
      const edgeB = edge as TriangleEdge;

      if (groupIndices[triangleA] !== groupIndices[triangleB]) {
        if (collectBlockedEdges) {
          blockedEdges.push({
            reason: "group",
            triangles: [triangleA, triangleB],
            edges: [edgeA, edgeB],
          });
        }
        return;
      }

      const dot = clamp(
        triangleVector(normals, triangleA, normalA).dot(triangleVector(normals, triangleB, normalB)),
        -1,
        1,
      );
      if (dot < hardNormalCos) {
        if (collectBlockedEdges) {
          blockedEdges.push({
            reason: "hard-normal",
            triangles: [triangleA, triangleB],
            edges: [edgeA, edgeB],
            angleDeg: Math.acos(dot) * RAD_TO_DEG,
          });
        }
        return;
      }

      addNeighbor(neighbors, firstEdgeIndex, edgeIndex);
    });
  }

  edgeUses.forEach((firstEdgeIndex) => {
    if (secondEdgeUses[firstEdgeIndex] !== STUDY_BAND_SENTINEL) {
      return;
    }
    openEdges[firstEdgeIndex] = 1;
    if (collectBlockedEdges) {
      blockedEdges.push({
        reason: "open",
        triangles: [Math.floor(firstEdgeIndex / 3)],
        edges: [(firstEdgeIndex % 3) as TriangleEdge],
      });
    }
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
  assertValueStepCount(stepCount);

  return Math.min(stepCount - 1, Math.max(0, Math.floor(clamp01(value) * stepCount)));
}

export const quantizeStudyValueToBand = quantizeStudyBand;

function computeBandConfidence(value: number, stepCount: QuantizedStepCount): number {
  const clampedValue = clamp01(value);
  if (clampedValue === 0 || clampedValue === 1) {
    return 1;
  }

  const scaledValue = clampedValue * stepCount;
  if (scaledValue < 1) {
    return clamp01((1 - scaledValue) * 2);
  }
  if (scaledValue > stepCount - 1) {
    return clamp01((scaledValue - (stepCount - 1)) * 2);
  }
  const fractional = scaledValue - Math.floor(scaledValue);
  return clamp01(Math.min(fractional, 1 - fractional) * 2);
}

function validateBandCleanupInput(graph: TriangleGraph, input: BandCleanupInput): void {
  assertValueStepCount(input.stepCount);
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

function chooseDominantNeighborBand(
  graph: TriangleGraph,
  triangles: readonly number[],
  componentBand: number,
  bands: Int8Array,
  compatibleBandDistance: number,
): number | null {
  const counts = new Map<number, number>();
  triangles.forEach((triangle) => {
    for (let edge = 0; edge < 3; edge += 1) {
      const neighbor = graph.neighbors[triangle * 3 + edge];
      if (neighbor < 0) {
        continue;
      }
      const neighborBand = bands[neighbor];
      if (neighborBand === componentBand) {
        continue;
      }
      if (Math.abs(neighborBand - componentBand) > compatibleBandDistance) {
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
  const visited = new Uint8Array(graph.triangleCount);
  const stack = new Int32Array(graph.triangleCount);

  for (let seed = 0; seed < graph.triangleCount; seed += 1) {
    if (visited[seed]) {
      continue;
    }

    const band = input.bands[seed];
    const tinyTriangles: number[] = [];
    let stackSize = 1;
    let componentSize = 0;
    let lowConfidenceCount = 0;
    let isLocked = false;
    let hasOpenBoundary = false;
    stack[0] = seed;
    visited[seed] = 1;

    while (stackSize > 0) {
      stackSize -= 1;
      const triangle = stack[stackSize];
      componentSize += 1;
      if (componentSize <= maxTinyComponentTriangles) {
        tinyTriangles.push(triangle);
      }
      lowConfidenceCount += input.lowConfidence[triangle] ? 1 : 0;
      isLocked ||= Boolean(input.locked[triangle]);

      for (let edge = 0; edge < 3; edge += 1) {
        const edgeIndex = triangle * 3 + edge;
        hasOpenBoundary ||= Boolean(graph.openEdges[edgeIndex]);
        const neighbor = graph.neighbors[edgeIndex];
        if (neighbor < 0 || visited[neighbor] || input.bands[neighbor] !== band) {
          continue;
        }
        visited[neighbor] = 1;
        stack[stackSize] = neighbor;
        stackSize += 1;
      }
    }

    if (
      componentSize > maxTinyComponentTriangles ||
      lowConfidenceCount / componentSize < 0.5 ||
      isLocked ||
      hasOpenBoundary
    ) {
      continue;
    }

    const targetBand = chooseDominantNeighborBand(
      graph,
      tinyTriangles,
      band,
      input.bands,
      compatibleBandDistance,
    );
    if (targetBand === null || targetBand === band) {
      continue;
    }

    tinyTriangles.forEach((triangle) => {
      output[triangle] = targetBand;
    });
  }

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
  const direct = clamp(-normal.dot(lightDirection), 0, 1);
  const key = direct * clamp(keyStrength, 0, 2.5) * 0.82;
  const bounce = getStudyBounce(normal, position, direct, bounceStrength, 0, 1);
  return clamp01(0.05 + key + bounce);
}

function computeClassicTopStudyValue(
  normal: Vector3,
  position: Vector3,
  keyStrength: number,
  bounceStrength: number,
): number {
  const overhead = clamp(normal.y, 0, 1);
  const broadTop = overhead ** 0.65;
  const key = overhead * clamp(keyStrength, 0, 2.5) * 0.78;
  const softTopFill = broadTop * clamp(keyStrength, 0, 2.5) * 0.08;
  const bounce = getStudyBounce(normal, position, overhead, bounceStrength, 0, 1) * 0.35;
  return clamp01(0.025 + key + softTopFill + bounce);
}

export type StudyBandComputationSettings = {
  lightDirection: readonly [number, number, number];
  keyStrength: number;
  bounceStrength: number;
  bandBias: number;
  stepCount: ValueStepCount;
  lightingMode: LightingMode;
};

export function createStudyBandComputationSettings(
  input: Omit<ComputeCleanStudyBandsInput, "geometry" | "renderStyle">,
): StudyBandComputationSettings {
  assertValueStepCount(input.stepCount);
  const effectiveLight = resolveStudyLight(input.light, input.lightingMode);
  const direction = normalizeLightDirection(lightPoseFromState(effectiveLight, input.lightTarget).direction);
  return {
    lightDirection: [direction.x, direction.y, direction.z],
    keyStrength: effectiveLight.intensity,
    bounceStrength: effectiveLight.bounceStrength,
    bandBias: input.valueRamp.bandBias,
    stepCount: input.stepCount,
    lightingMode: input.lightingMode,
  };
}

function computeRawBands(
  graph: TriangleGraph,
  settings: StudyBandComputationSettings,
): Pick<CleanedStudyBandResult, "values" | "bands" | "lowConfidence"> {
  const values = new Float32Array(graph.triangleCount);
  const bands = new Int8Array(graph.triangleCount);
  const lowConfidence = new Uint8Array(graph.triangleCount);
  const lightDirection = normalizeLightDirection(
    new Vector3(
      settings.lightDirection[0],
      settings.lightDirection[1],
      settings.lightDirection[2],
    ),
  );
  const normal = new Vector3();
  const centroid = new Vector3();

  for (let triangle = 0; triangle < graph.triangleCount; triangle += 1) {
    triangleVector(graph.normals, triangle, normal);
    triangleVector(graph.centroids, triangle, centroid);
    const value = settings.lightingMode === "classic-top"
      ? computeClassicTopStudyValue(normal, centroid, settings.keyStrength, settings.bounceStrength)
      : computeDirectionalStudyValue(
        normal,
        centroid,
        lightDirection,
        settings.keyStrength,
        settings.bounceStrength,
      );
    const biasedValue = clamp01(value + settings.bandBias);

    values[triangle] = value;
    bands[triangle] = quantizeStudyBand(biasedValue, settings.stepCount);
    lowConfidence[triangle] =
      computeBandConfidence(biasedValue, settings.stepCount) <= DEFAULT_LOW_CONFIDENCE_THRESHOLD
        ? 1
        : 0;
  }

  return { values, bands, lowConfidence };
}

export function computeCleanedStudyBandsFromGraph(
  graph: TriangleGraph,
  settings: StudyBandComputationSettings,
  options: ValueBandCleanupOptions = {},
): CleanedStudyBandResult {
  assertValueStepCount(settings.stepCount);
  const labels = computeRawBands(graph, settings);
  const cleanedBands = cleanupBandIslands(
    graph,
    {
      bands: labels.bands,
      locked: new Uint8Array(graph.triangleCount),
      lowConfidence: labels.lowConfidence,
      stepCount: settings.stepCount,
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

export function computeCleanedStudyBands(
  input: ComputeCleanStudyBandsInput,
  options: ValueBandCleanupOptions = {},
): CleanedStudyBandResult | null {
  if (input.renderStyle === "smooth") {
    return null;
  }

  const graph = buildTriangleGraph(input.geometry, options);
  const settings = createStudyBandComputationSettings(input);
  return computeCleanedStudyBandsFromGraph(graph, settings, options);
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
