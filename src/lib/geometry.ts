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
  type OrientationTurn,
} from "../types";

const TARGET_MAX_DIMENSION = 4;
const MIN_TRIANGLE_COUNT = 1;
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

export function assertValidModelOrientation(orientation: ModelOrientation): void {
  if (!orientation || typeof orientation !== "object") {
    throw new GeometryValidationError("Invalid model orientation: missing orientation object");
  }

  normalizeQuarterTurns(orientation.x);
  normalizeQuarterTurns(orientation.y);
  normalizeQuarterTurns(orientation.z);
}

export function applyOrientationToGeometry(
  geometry: BufferGeometry,
  orientation: ModelOrientation = DEFAULT_MODEL_ORIENTATION,
): BufferGeometry {
  const workingGeometry = geometry.clone();
  const normalizedOrientation: ModelOrientation = {
    x: normalizeQuarterTurns(orientation.x),
    y: normalizeQuarterTurns(orientation.y),
    z: normalizeQuarterTurns(orientation.z),
  };

  if (normalizedOrientation.x > 0) {
    workingGeometry.rotateX(normalizedOrientation.x * HALF_PI);
  }
  if (normalizedOrientation.y > 0) {
    workingGeometry.rotateY(normalizedGeometryAxis(normalizedOrientation.y));
  }
  if (normalizedOrientation.z > 0) {
    workingGeometry.rotateZ(normalizedGeometryAxis(normalizedOrientation.z));
  }

  return workingGeometry;
}

function normalizedGeometryAxis(turns: OrientationTurn): number {
  return turns * HALF_PI;
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

export function assertValidGeometry(geometry: BufferGeometry): void {
  if (!geometry || !("isBufferGeometry" in geometry)) {
    throw new GeometryValidationError("Invalid STL geometry: parsed geometry is missing");
  }

  const position = getPositionAttribute(geometry);
  if (!isValidGeometryAttribute(position, "position")) {
    throw new GeometryValidationError("Invalid STL geometry: missing or empty position attribute");
  }

  ensureFiniteGeometryData(position);

  if (position.count % 3 !== 0) {
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
  for (let i = 0; i < normalValues.length; i += 1) {
    if (!Number.isFinite(normalValues[i])) {
      throw new GeometryValidationError(`Invalid STL geometry: normal contains non-finite value at index ${i}`);
    }
  }
}

export function normalizeGeometryForDisplay(
  geometry: BufferGeometry,
  orientation: ModelOrientation = DEFAULT_MODEL_ORIENTATION,
): GeometryFitResult {
  const workingGeometry = applyOrientationToGeometry(geometry, orientation);
  const position = getPositionAttribute(workingGeometry);

  const originalBounds = new Box3().setFromBufferAttribute(position);
  if (originalBounds.isEmpty()) {
    throw new GeometryValidationError("Invalid STL geometry: cannot compute bounds from empty geometry");
  }

  const originalSize = new Vector3();
  originalBounds.getSize(originalSize);
  const maxDimension = Math.max(originalSize.x, originalSize.y, originalSize.z);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    throw new GeometryValidationError("Invalid STL geometry: invalid extents for normalization");
  }

  const scale = TARGET_MAX_DIMENSION / maxDimension;
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
