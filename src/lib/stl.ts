import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { BufferGeometry } from "three";
import {
  type LoadedModel,
  type ModelFitState,
  type ModelMetadata,
  type ModelOrientation,
  type OrientationAxis,
  DEFAULT_MODEL_ORIENTATION,
} from "../types";
import {
  normalizeGeometryForDisplay,
  recomputeNormals,
  assertValidGeometry,
  getTriangleCountFromGeometry,
} from "./geometry";

export type StlLoadResult = {
  sourceGeometry: BufferGeometry;
  geometry: BufferGeometry;
  metadata: ModelMetadata;
  fit: ModelFitState;
  orientation: ModelOrientation;
};

type StlLoadInput = {
  arrayBuffer: ArrayBuffer;
  fileName: string;
  fileSize: number;
};

function buildLoadedModel(input: {
  sourceGeometry: BufferGeometry;
  metadata: ModelMetadata;
  orientation?: ModelOrientation;
  id?: number;
}): LoadedModel {
  const { sourceGeometry, metadata, orientation = DEFAULT_MODEL_ORIENTATION, id = Date.now() } = input;
  const safeOrientation = normalizeOrientation(orientation);
  const { geometry, fit } = normalizeGeometryForDisplay(sourceGeometry, safeOrientation);

  return {
    id,
    sourceGeometry,
    geometry,
    orientation: safeOrientation,
    metadata,
    fit,
  };
}

export function parseStlArrayBuffer(input: StlLoadInput): StlLoadResult {
  const { arrayBuffer, fileName, fileSize } = input;

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error("Cannot parse STL: file content is empty");
  }

  if (!Number.isInteger(fileSize) || fileSize < 0) {
    throw new Error(`Invalid STL metadata: fileSize must be a non-negative integer (${String(fileSize)})`);
  }

  if (!fileName || fileName.trim().length === 0) {
    throw new Error("Invalid STL metadata: fileName is required");
  }

  let parsedGeometry: BufferGeometry;
  try {
    parsedGeometry = new STLLoader().parse(arrayBuffer);
  } catch (error) {
    throw new Error(
      `Invalid STL content for ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  assertValidGeometry(parsedGeometry);
  recomputeNormals(parsedGeometry);

  const orientation = { ...DEFAULT_MODEL_ORIENTATION };
  const { geometry, fit } = normalizeGeometryForDisplay(parsedGeometry, orientation);
  const triangleCount = getTriangleCountFromGeometry(parsedGeometry);

  return {
    sourceGeometry: parsedGeometry,
    geometry,
    fit,
    orientation,
    metadata: {
      fileName,
      fileSize,
      triangleCount,
      loadedAt: Date.now(),
    },
  };
}

export async function parseStlFile(file: File): Promise<StlLoadResult> {
  if (!file) {
    throw new Error("Cannot parse STL: file is required");
  }

  if (typeof File === "undefined" || !(file instanceof File)) {
    throw new Error("Cannot parse STL: expected a File object");
  }

  if (file.size <= 0) {
    throw new Error(`Cannot parse STL: file "${file.name}" is empty`);
  }

  const arrayBuffer = await file.arrayBuffer();
  return parseStlArrayBuffer({
    arrayBuffer,
    fileName: file.name,
    fileSize: file.size,
  });
}

export async function loadStlFile(file: File): Promise<LoadedModel> {
  const modelData = await parseStlFile(file);

  return buildLoadedModel({
    sourceGeometry: modelData.sourceGeometry,
    metadata: modelData.metadata,
    orientation: modelData.orientation,
    id: Date.now(),
  });
}

function normalizeTurn(turns: number): 0 | 1 | 2 | 3 {
  if (!Number.isInteger(turns)) {
    throw new Error(`Invalid quarter turn value: ${String(turns)}`);
  }

  return (((turns % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}

function normalizeOrientation(orientation: ModelOrientation): ModelOrientation {
  return {
    x: normalizeTurn(orientation.x),
    y: normalizeTurn(orientation.y),
    z: normalizeTurn(orientation.z),
  };
}

export function rotateOrientation(
  orientation: ModelOrientation,
  axis: OrientationAxis,
  quarterTurns = 1,
): ModelOrientation {
  const currentOrientation = normalizeOrientation(orientation);
  const currentTurns = currentOrientation[axis];
  const deltaTurns = normalizeTurn(quarterTurns);
  const nextTurns = ((currentTurns + deltaTurns) % 4) as 0 | 1 | 2 | 3;

  return {
    ...currentOrientation,
    [axis]: nextTurns,
  };
}

export function rebuildLoadedModel(model: LoadedModel, orientation: ModelOrientation): LoadedModel {
  return buildLoadedModel({
    sourceGeometry: model.sourceGeometry,
    metadata: model.metadata,
    orientation,
    id: model.id,
  });
}

export function rotateLoadedModel(
  model: LoadedModel,
  axis: OrientationAxis,
  quarterTurns = 1,
): LoadedModel {
  const nextOrientation = rotateOrientation(model.orientation, axis, quarterTurns);
  return rebuildLoadedModel(model, nextOrientation);
}
