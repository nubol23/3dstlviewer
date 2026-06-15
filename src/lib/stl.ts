import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { BufferGeometry } from "three";
import {
  type LoadedModel,
  type ModelFitState,
  type ModelMetadata,
  type ModelOrientation,
  type OrientationAxis,
  type OrientationTurnOperation,
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
  id?: string;
}): LoadedModel {
  const { sourceGeometry, metadata, orientation = DEFAULT_MODEL_ORIENTATION, id = crypto.randomUUID() } = input;
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

function buildLoadedModelFromParsed(input: StlLoadResult & { id?: string }): LoadedModel {
  return {
    id: input.id ?? crypto.randomUUID(),
    sourceGeometry: input.sourceGeometry,
    geometry: input.geometry,
    orientation: normalizeOrientation(input.orientation),
    metadata: input.metadata,
    fit: input.fit,
  };
}

export function parseStlArrayBuffer(input: StlLoadInput): StlLoadResult {
  const { arrayBuffer, fileName, fileSize } = input;

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error("Cannot parse STL: file content is empty");
  }

  if (!Number.isInteger(fileSize) || fileSize <= 0) {
    throw new Error(`Invalid STL metadata: fileSize must be a positive integer (${String(fileSize)})`);
  }

  if (fileSize !== arrayBuffer.byteLength) {
    throw new Error(`Invalid STL metadata: fileSize (${fileSize}) does not match content length (${arrayBuffer.byteLength})`);
  }

  if (!fileName || fileName.trim().length === 0) {
    throw new Error("Invalid STL metadata: fileName is required");
  }

  assertPlausibleStlBuffer(arrayBuffer, fileName);

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

  const orientation = cloneOrientation(DEFAULT_MODEL_ORIENTATION);
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

  return buildLoadedModelFromParsed(modelData);
}

function normalizeTurn(turns: number): 0 | 1 | 2 | 3 {
  if (!Number.isInteger(turns)) {
    throw new Error(`Invalid quarter turn value: ${String(turns)}`);
  }

  return (((turns % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}

function normalizeOrientation(orientation: ModelOrientation): ModelOrientation {
  return {
    operations: orientation.operations.flatMap((operation) => {
      const turns = normalizeTurn(operation.quarterTurns);
      if (turns === 0) {
        return [];
      }
      if (operation.axis !== "x" && operation.axis !== "y" && operation.axis !== "z") {
        throw new Error(`Invalid orientation axis: ${String(operation.axis)}`);
      }
      return [{ axis: operation.axis, quarterTurns: turns as OrientationTurnOperation["quarterTurns"] }];
    }),
  };
}

export function rotateOrientation(
  orientation: ModelOrientation,
  axis: OrientationAxis,
  quarterTurns = 1,
): ModelOrientation {
  const currentOrientation = normalizeOrientation(orientation);
  const deltaTurns = normalizeTurn(quarterTurns);
  if (axis !== "x" && axis !== "y" && axis !== "z") {
    throw new Error(`Invalid orientation axis: ${String(axis)}`);
  }
  if (deltaTurns === 0) {
    return currentOrientation;
  }

  const operations = [...currentOrientation.operations];
  const last = operations[operations.length - 1];
  if (last?.axis === axis) {
    const combined = normalizeTurn(last.quarterTurns + deltaTurns);
    if (combined === 0) {
      operations.pop();
    } else {
      operations[operations.length - 1] = { axis, quarterTurns: combined as OrientationTurnOperation["quarterTurns"] };
    }
  } else {
    operations.push({ axis, quarterTurns: deltaTurns as OrientationTurnOperation["quarterTurns"] });
  }

  return { operations };
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

function cloneOrientation(orientation: ModelOrientation): ModelOrientation {
  return {
    operations: orientation.operations.map((operation) => ({ ...operation })),
  };
}

function startsWithSolid(arrayBuffer: ArrayBuffer): boolean {
  const reader = new DataView(arrayBuffer);
  const solid = [115, 111, 108, 105, 100];
  for (let offset = 0; offset < 5 && offset + solid.length <= reader.byteLength; offset += 1) {
    let matches = true;
    for (let i = 0; i < solid.length; i += 1) {
      if (reader.getUint8(offset + i) !== solid[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return true;
    }
  }
  return false;
}

function assertPlausibleStlBuffer(arrayBuffer: ArrayBuffer, fileName: string): void {
  if (arrayBuffer.byteLength < 84) {
    if (startsWithSolid(arrayBuffer)) {
      return;
    }
    throw new Error(`Invalid STL content for ${fileName}: binary STL is too small`);
  }

  if (startsWithSolid(arrayBuffer)) {
    return;
  }

  const reader = new DataView(arrayBuffer);
  const faceCount = reader.getUint32(80, true);
  const expectedBytes = 84 + faceCount * 50;
  if (expectedBytes !== arrayBuffer.byteLength) {
    throw new Error(
      `Invalid STL content for ${fileName}: binary face count expects ${expectedBytes} bytes, got ${arrayBuffer.byteLength}`,
    );
  }
}
