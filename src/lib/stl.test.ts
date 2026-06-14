import { describe, expect, it } from "vitest";
import { parseStlArrayBuffer, rebuildLoadedModel, rotateLoadedModel, rotateOrientation } from "./stl";
import { getTriangleCountFromGeometry, normalizeGeometryForDisplay, assertValidGeometry } from "./geometry";
import { BufferAttribute, BufferGeometry } from "three";
import { DEFAULT_MODEL_ORIENTATION, type LoadedModel } from "../types";

function createTinyAsciiStl(triangleCount = 1): ArrayBuffer {
  const triangles: Array<{
    normal: [number, number, number];
    vertices: Array<[number, number, number]>;
  }> = [];

  for (let i = 0; i < triangleCount; i += 1) {
    const offset = i % 2 === 0 ? 0 : 1;
    triangles.push({
      normal: [0, 0, 1],
      vertices: [
        [offset, 0, 0],
        [1 + offset, 0, 0],
        [offset, 1, 0],
      ],
    });
  }

  const lines = ["solid tiny-stl"];
  triangles.forEach((triangle) => {
    lines.push(`facet normal ${triangle.normal.join(" ")}`);
    lines.push("  outer loop");
    triangle.vertices.forEach((vertex) => {
      lines.push(`    vertex ${vertex.join(" ")}`);
    });
    lines.push("  endloop");
    lines.push("endfacet");
  });
  lines.push("endsolid tiny-stl");

  const utf8 = new TextEncoder().encode(lines.join("\n"));
  return utf8.buffer;
}

function createOffsetGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      Float32Array.from([
        0, 0, 0,
        4, 0, 0,
        0, 3, 0,
        0, 0, 2,
        2, 0, 0,
        0, 1, 2,
      ]),
      3,
    ),
  );

  return geometry;
}

function computePositionBounds(geometry: BufferGeometry): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} {
  const attribute = geometry.getAttribute("position");
  const values = attribute.array;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < values.length; i += 3) {
    const x = values[i];
    const y = values[i + 1];
    const z = values[i + 2];

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function loadModelFixture(): LoadedModel {
  const arrayBuffer = createTinyAsciiStl(1);
  const parsed = parseStlArrayBuffer({
    arrayBuffer,
    fileName: "triangle.stl",
    fileSize: 128,
  });

  return {
    id: 123,
    sourceGeometry: parsed.sourceGeometry,
    geometry: parsed.geometry,
    orientation: parsed.orientation,
    metadata: parsed.metadata,
    fit: parsed.fit,
  };
}

describe("STL loading and parsing", () => {
  it("loads STL from ArrayBuffer, computes fit metadata, and normalizes geometry", () => {
    const arrayBuffer = createTinyAsciiStl(1);
    const result = parseStlArrayBuffer({
      arrayBuffer,
      fileName: "triangle.stl",
      fileSize: 1024,
    });

    expect(result.metadata.triangleCount).toBe(1);
    expect(result.metadata.fileName).toBe("triangle.stl");
    expect(result.metadata.fileSize).toBe(1024);
    expect(result.fit.size.x).toBeCloseTo(4);
    expect(result.fit.size.y).toBeCloseTo(4);

    const bounds = computePositionBounds(result.geometry);
    expect(bounds.minY).toBeCloseTo(0);
    expect(Math.abs(bounds.minX + bounds.maxX)).toBeLessThan(1e-6);
    expect(Math.abs(bounds.minZ + bounds.maxZ)).toBeLessThan(1e-6);

    const normalValues = result.geometry.getAttribute("normal").array;
    expect(normalValues.length).toBe(result.geometry.getAttribute("position").count * 3);
    const hasNonZeroNormal = normalValues.some((value) => value !== 0);
    expect(hasNonZeroNormal).toBe(true);
  });

  it("throws when loading empty binary STL with no triangles", () => {
    const zeroFaceBuffer = new ArrayBuffer(84);
    const view = new DataView(zeroFaceBuffer);
    view.setUint32(80, 0, true);

    expect(() =>
      parseStlArrayBuffer({
        arrayBuffer: zeroFaceBuffer,
        fileName: "empty.stl",
        fileSize: 84,
      }),
    ).toThrow(/missing or empty position attribute|contains no triangles/);
  });

  it("throws for invalid raw buffer input", () => {
    const raw = new ArrayBuffer(1);
    expect(() =>
      parseStlArrayBuffer({
        arrayBuffer: raw,
        fileName: "invalid.stl",
        fileSize: 1,
      }),
    ).toThrow(/Invalid STL content/);
  });

  it("normalizes geometry independently and reports fit state", () => {
    const arrayBuffer = createTinyAsciiStl(2);
    const result = parseStlArrayBuffer({
      arrayBuffer,
      fileName: "double-triangle.stl",
      fileSize: 2048,
    });

    expect(result.metadata.triangleCount).toBe(2);

    const bounds = computePositionBounds(result.geometry);
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    expect(Math.max(spanX, spanY)).toBeCloseTo(4);
    expect(bounds.maxZ - bounds.minZ).toBeCloseTo(0);

    expect(result.fit.scale).toBeGreaterThan(0);
  });
});

describe("geometry helpers", () => {
  it("accepts geometry that can be normalized and rejects empties", () => {
    const arrayBuffer = createTinyAsciiStl(1);
    const { geometry } = parseStlArrayBuffer({
      arrayBuffer,
      fileName: "triangle.stl",
      fileSize: 16,
    });

    expect(() => assertValidGeometry(geometry)).not.toThrow();
    expect(getTriangleCountFromGeometry(geometry)).toBe(1);

    const { geometry: normalized } = normalizeGeometryForDisplay(geometry);
    expect(normalized.getAttribute("position").count).toBe(3);
  });

  it("rotates orientations with wrapping quarter-turn logic", () => {
    const quarter = rotateOrientation(DEFAULT_MODEL_ORIENTATION, "x", 4);
    expect(quarter).toEqual(DEFAULT_MODEL_ORIENTATION);

    const wrap = rotateOrientation(DEFAULT_MODEL_ORIENTATION, "y", -1);
    expect(wrap).toEqual({ x: 0, y: 3, z: 0 });

    const stepped = rotateOrientation({ x: 0, y: 2, z: 0 }, "y", 1);
    expect(stepped).toEqual({ x: 0, y: 3, z: 0 });
  });

  it("rebuilds from source geometry and preserves metadata and floor alignment", () => {
    const model = loadModelFixture();
    const rotated = rotateLoadedModel(model, "x", 1);

    expect(rotated.sourceGeometry).toBe(model.sourceGeometry);
    expect(rotated.metadata).toEqual(model.metadata);
    expect(rotated.fit.fittedBounds.min.y).toBeCloseTo(0);
    expect(rotated.orientation).toEqual({ x: 1, y: 0, z: 0 });

    const modelBounds = computePositionBounds(rotated.geometry);
    expect(modelBounds.minY).toBeCloseTo(0);
    expect(modelBounds.maxX).toBeGreaterThan(0);
    expect(rotated.fit.scale).toBeGreaterThan(0);
  });

  it("re-orients from source geometry without drifting from sequential quarter-turn calls", () => {
    const model = loadModelFixture();
    const fromCurrent = rotateLoadedModel(model, "z", 1);
    const fromCurrentTwice = rotateLoadedModel(fromCurrent, "z", 1);
    const direct = rebuildLoadedModel(model, { x: 0, y: 0, z: 2 });

    const fromCurrentTwiceBounds = computePositionBounds(fromCurrentTwice.geometry);
    const directBounds = computePositionBounds(direct.geometry);

    expect(fromCurrentTwice.orientation).toEqual({ x: 0, y: 0, z: 2 });
    expect(fromCurrentTwiceBounds.minY).toBeCloseTo(0);
    expect(direct.fit.scale).toBeCloseTo(fromCurrentTwice.fit.scale);
    expect(fromCurrentTwiceBounds.minX).toBeCloseTo(directBounds.minX);
    expect(fromCurrentTwiceBounds.minY).toBeCloseTo(directBounds.minY);
    expect(fromCurrentTwiceBounds.maxY).toBeCloseTo(directBounds.maxY);
  });

  it("applies an orientation to raw geometry before fitting", () => {
    const geometry = createOffsetGeometry();
    const normalizedDefault = normalizeGeometryForDisplay(geometry, DEFAULT_MODEL_ORIENTATION);
    const normalizedRotated = normalizeGeometryForDisplay(geometry, { x: 0, y: 1, z: 0 });

    const defaultBounds = computePositionBounds(normalizedDefault.geometry);
    const rotatedBounds = computePositionBounds(normalizedRotated.geometry);
    const defaultSpanX = defaultBounds.maxX - defaultBounds.minX;
    const defaultSpanY = defaultBounds.maxY - defaultBounds.minY;
    const defaultSpanZ = defaultBounds.maxZ - defaultBounds.minZ;
    const rotatedSpanX = rotatedBounds.maxX - rotatedBounds.minX;
    const rotatedSpanY = rotatedBounds.maxY - rotatedBounds.minY;
    const rotatedSpanZ = rotatedBounds.maxZ - rotatedBounds.minZ;

    expect(normalizedDefault.fit.fittedBounds.min.y).toBeCloseTo(0);
    expect(normalizedRotated.fit.fittedBounds.min.y).toBeCloseTo(0);
    expect(Math.max(defaultSpanX, defaultSpanY, defaultSpanZ)).toBeCloseTo(4);
    expect(Math.max(rotatedSpanX, rotatedSpanY, rotatedSpanZ)).toBeCloseTo(4);
    expect(rotatedSpanX).not.toBeCloseTo(defaultSpanX);
    expect(rotatedSpanZ).not.toBeCloseTo(defaultSpanZ);
  });
});
