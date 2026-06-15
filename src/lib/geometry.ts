import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Vector3,
} from "three";
import {
  DEFAULT_MODEL_ORIENTATION,
  type ModelFitState,
  type ModelOrientation,
  type OrientationAxis,
  type OrientationTurn,
  type OrientationTurnOperation,
} from "../types";

const TARGET_MAX_DIMENSION = 4;
const MIN_TRIANGLE_COUNT = 1;
export const MIN_GEOMETRY_EXTENT = 1e-12;
export const MIN_TRIANGLE_AREA = 1e-24;
export const MAX_DISPLAY_SCALE = 1e12;
const HALF_PI = Math.PI / 2;

export class GeometryValidationError extends Error {
  override name = "GeometryValidationError";
}

export interface GeometryFitResult {
  geometry: BufferGeometry;
  fit: ModelFitState;
}

function normalizeQuarterTurns(turns: number): OrientationTurn {
  if (!Number.isInteger(turns)) {
    throw new GeometryValidationError(`Invalid model orientation: ${String(turns)} is not an integer`);
  }

  const normalized = ((turns % 4) + 4) % 4;
  return normalized as OrientationTurn;
}

function normalizeOrientationOperation(operation: OrientationTurnOperation): OrientationTurnOperation | null {
  if (!operation || typeof operation !== "object") {
    throw new GeometryValidationError("Invalid model orientation: operation must be an object");
  }

  if (operation.axis !== "x" && operation.axis !== "y" && operation.axis !== "z") {
    throw new GeometryValidationError(`Invalid model orientation axis: ${String(operation.axis)}`);
  }

  const turns = normalizeQuarterTurns(operation.quarterTurns);
  if (turns === 0) {
    return null;
  }

  return {
    axis: operation.axis,
    quarterTurns: turns,
  };
}

function normalizeOrientation(orientation: ModelOrientation): ModelOrientation {
  assertValidModelOrientation(orientation);

  return {
    operations: orientation.operations.flatMap((operation) => {
      const normalized = normalizeOrientationOperation(operation);
      return normalized ? [normalized] : [];
    }),
  };
}

export function assertValidModelOrientation(orientation: ModelOrientation): void {
  if (!orientation || typeof orientation !== "object") {
    throw new GeometryValidationError("Invalid model orientation: missing orientation object");
  }

  if (!Array.isArray(orientation.operations)) {
    throw new GeometryValidationError("Invalid model orientation: operations must be an array");
  }

  orientation.operations.forEach((operation) => {
    normalizeOrientationOperation(operation);
  });
}

export function applyOrientationToGeometry(
  geometry: BufferGeometry,
  orientation: ModelOrientation = DEFAULT_MODEL_ORIENTATION,
): BufferGeometry {
  const workingGeometry = geometry.clone();
  const normalizedOrientation = normalizeOrientation(orientation);

  normalizedOrientation.operations.forEach((operation) => {
    rotateGeometryByOperation(workingGeometry, operation.axis, operation.quarterTurns);
  });

  return workingGeometry;
}

function rotateGeometryByOperation(geometry: BufferGeometry, axis: OrientationAxis, turns: OrientationTurn): void {
  const radians = turns * HALF_PI;
  if (axis === "x") {
    geometry.rotateX(radians);
    return;
  }
  if (axis === "y") {
    geometry.rotateY(radians);
    return;
  }
  geometry.rotateZ(radians);
}

function getPositionAttribute(geometry: BufferGeometry): BufferAttribute {
  const attribute = geometry.getAttribute("position");
  if (!(attribute instanceof BufferAttribute)) {
    throw new GeometryValidationError("Invalid STL geometry: missing or unsupported position attribute");
  }

  return attribute;
}

export function getTriangleCountFromGeometry(geometry: BufferGeometry): number {
  const index = geometry.index;
  if (index) {
    if (index.count % 3 !== 0) {
      throw new GeometryValidationError("Invalid STL geometry: index count is not divisible by 3");
    }

    return index.count / 3;
  }

  const position = getPositionAttribute(geometry);
  if (position.count % 3 !== 0) {
    throw new GeometryValidationError(
      `Invalid STL geometry: position count (${position.count}) is not divisible by 3`,
    );
  }
  return position.count / 3;
}

function isValidGeometryAttribute(attribute: BufferAttribute | undefined, label: string): attribute is BufferAttribute {
  if (!attribute) {
    return false;
  }

  if (attribute.itemSize !== 3) {
    throw new GeometryValidationError(
      `Invalid STL geometry: ${label} attribute must have 3 components per vertex`,
    );
  }

  if (attribute.count <= 0) {
    return false;
  }

  return true;
}

function ensureFiniteGeometryData(attribute: BufferAttribute): void {
  const values = attribute.array;
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) {
      throw new GeometryValidationError(`Invalid STL geometry: position contains non-finite value at index ${i}`);
    }
  }
}

function ensureValidGroups(geometry: BufferGeometry, triangleIndexCount: number): void {
  if (geometry.groups.length === 0) {
    return;
  }

  const sortedGroups = [...geometry.groups].sort((a, b) => a.start - b.start);
  let expectedStart = 0;
  sortedGroups.forEach((group, groupIndex) => {
    if (!Number.isInteger(group.start) || !Number.isInteger(group.count)) {
      throw new GeometryValidationError(`Invalid STL geometry: group ${groupIndex} has non-integer range`);
    }
    if (group.start < 0 || group.count <= 0) {
      throw new GeometryValidationError(`Invalid STL geometry: group ${groupIndex} has invalid range`);
    }
    if (group.start % 3 !== 0 || group.count % 3 !== 0) {
      throw new GeometryValidationError(`Invalid STL geometry: group ${groupIndex} does not align to triangle boundaries`);
    }
    if (group.start !== expectedStart) {
      throw new GeometryValidationError(`Invalid STL geometry: group ${groupIndex} leaves a gap or overlap`);
    }

    expectedStart = group.start + group.count;
    if (expectedStart > triangleIndexCount) {
      throw new GeometryValidationError(`Invalid STL geometry: group ${groupIndex} exceeds geometry range`);
    }
  });

  if (expectedStart !== triangleIndexCount) {
    throw new GeometryValidationError("Invalid STL geometry: groups do not cover the geometry");
  }
}

function getTriangleVertexIndex(geometry: BufferGeometry, triangleVertex: number): number {
  const index = geometry.index;
  if (!index) {
    return triangleVertex;
  }

  return index.getX(triangleVertex);
}

function ensureFiniteExtentsAndNonDegenerateTriangles(geometry: BufferGeometry, position: BufferAttribute): void {
  const bounds = new Box3().setFromBufferAttribute(position);
  const size = new Vector3();
  bounds.getSize(size);
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDimension) || maxDimension < MIN_GEOMETRY_EXTENT) {
    throw new GeometryValidationError("Invalid STL geometry: extents are too small for stable normalization");
  }

  const triangleCount = getTriangleCountFromGeometry(geometry);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const vertexOffset = triangle * 3;
    const aIndex = getTriangleVertexIndex(geometry, vertexOffset);
    const bIndex = getTriangleVertexIndex(geometry, vertexOffset + 1);
    const cIndex = getTriangleVertexIndex(geometry, vertexOffset + 2);
    a.fromBufferAttribute(position, aIndex);
    b.fromBufferAttribute(position, bIndex);
    c.fromBufferAttribute(position, cIndex);
    ab.subVectors(b, a);
    ac.subVectors(c, a);

    const area = ab.cross(ac).length() / 2;
    if (!Number.isFinite(area) || area <= MIN_TRIANGLE_AREA) {
      throw new GeometryValidationError(`Invalid STL geometry: triangle ${triangle} has zero or near-zero area`);
    }
  }
}

export function assertValidGeometry(geometry: BufferGeometry): void {
  if (!geometry || !("isBufferGeometry" in geometry)) {
    throw new GeometryValidationError("Invalid STL geometry: parsed geometry is missing");
  }

  const position = getPositionAttribute(geometry);
  if (!isValidGeometryAttribute(position, "position")) {
    throw new GeometryValidationError("Invalid STL geometry: missing or empty position attribute");
  }

  ensureFiniteGeometryData(position);

  if (geometry.index) {
    if (geometry.index.count % 3 !== 0) {
      throw new GeometryValidationError(
        `Invalid STL geometry: index count (${geometry.index.count}) is not divisible by 3`,
      );
    }
  } else if (position.count % 3 !== 0) {
    throw new GeometryValidationError(
      `Invalid STL geometry: position count (${position.count}) is not divisible by 3`,
    );
  }

  if (geometry.index) {
    const indices = geometry.index.array;
    for (let i = 0; i < indices.length; i += 1) {
      const index = indices[i];
      if (!Number.isInteger(index) || index < 0 || index >= position.count) {
        throw new GeometryValidationError(`Invalid STL geometry: index out of bounds at index attribute entry ${i}`);
      }
    }
  }

  const triangleCount = getTriangleCountFromGeometry(geometry);
  if (triangleCount < MIN_TRIANGLE_COUNT) {
    throw new GeometryValidationError("Invalid STL geometry: geometry contains no triangles");
  }

  ensureValidGroups(geometry, triangleCount * 3);
  ensureFiniteExtentsAndNonDegenerateTriangles(geometry, position);
}

export function recomputeNormals(geometry: BufferGeometry): void {
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();

  const normal = geometry.getAttribute("normal");
  if (!(normal instanceof BufferAttribute)) {
    throw new GeometryValidationError("Invalid STL geometry: failed to compute vertex normals");
  }

  if (!isValidGeometryAttribute(normal, "normal")) {
    throw new GeometryValidationError("Invalid STL geometry: computed normals are missing or empty");
  }

  const normalValues = normal.array;
  let hasNonZeroNormal = false;
  for (let i = 0; i < normalValues.length; i += 1) {
    if (!Number.isFinite(normalValues[i])) {
      throw new GeometryValidationError(`Invalid STL geometry: normal contains non-finite value at index ${i}`);
    }
    if (normalValues[i] !== 0) {
      hasNonZeroNormal = true;
    }
  }

  if (!hasNonZeroNormal) {
    throw new GeometryValidationError("Invalid STL geometry: computed normals are all zero");
  }
}

export function normalizeGeometryForDisplay(
  geometry: BufferGeometry,
  orientation: ModelOrientation = DEFAULT_MODEL_ORIENTATION,
): GeometryFitResult {
  assertValidGeometry(geometry);
  const workingGeometry = applyOrientationToGeometry(geometry, orientation);
  const position = getPositionAttribute(workingGeometry);

  const originalBounds = new Box3().setFromBufferAttribute(position);
  if (originalBounds.isEmpty()) {
    throw new GeometryValidationError("Invalid STL geometry: cannot compute bounds from empty geometry");
  }

  const originalSize = new Vector3();
  originalBounds.getSize(originalSize);
  const maxDimension = Math.max(originalSize.x, originalSize.y, originalSize.z);
  if (!Number.isFinite(maxDimension) || maxDimension < MIN_GEOMETRY_EXTENT) {
    throw new GeometryValidationError("Invalid STL geometry: invalid extents for normalization");
  }

  const scale = TARGET_MAX_DIMENSION / maxDimension;
  if (!Number.isFinite(scale) || scale > MAX_DISPLAY_SCALE) {
    throw new GeometryValidationError("Invalid STL geometry: normalization scale is too large");
  }
  workingGeometry.scale(scale, scale, scale);
  const scaledPosition = getPositionAttribute(workingGeometry);

  const scaledBounds = new Box3().setFromBufferAttribute(scaledPosition);
  const shiftX = -(scaledBounds.min.x + scaledBounds.max.x) / 2;
  const shiftZ = -(scaledBounds.min.z + scaledBounds.max.z) / 2;
  const shiftY = -scaledBounds.min.y;
  workingGeometry.translate(shiftX, shiftY, shiftZ);
  const finalPosition = getPositionAttribute(workingGeometry);

  const fittedBounds = new Box3().setFromBufferAttribute(finalPosition);
  if (fittedBounds.isEmpty()) {
    throw new GeometryValidationError("Invalid STL geometry: normalization produced an empty geometry");
  }

  const fittedSize = new Vector3();
  fittedBounds.getSize(fittedSize);
  const fittedCenter = new Vector3();
  fittedBounds.getCenter(fittedCenter);
  const radius = fittedSize.length() / 2;

  return {
    geometry: workingGeometry,
    fit: {
      originalBounds: originalBounds.clone(),
      fittedBounds: fittedBounds.clone(),
      center: fittedCenter,
      size: fittedSize,
      radius,
      scale,
    },
  };
}
