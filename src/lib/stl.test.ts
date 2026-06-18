import { describe, expect, it } from "vitest";
import { parseStlArrayBuffer, rebuildLoadedModel, rotateLoadedModel, rotateOrientation } from "./stl";
import { getTriangleCountFromGeometry, normalizeGeometryForDisplay, assertValidGeometry } from "./geometry";
import { BufferAttribute, BufferGeometry } from "three";
import { DEFAULT_MODEL_ORIENTATION, type LoadedModel } from "../types";

type StlTriangle = {
  normal: [number, number, number];
  vertices: Array<[number, number, number]>;
};

function createAsciiStlFromTriangles(triangles: StlTriangle[]): ArrayBuffer {
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

function createTinyAsciiStl(triangleCount = 1): ArrayBuffer {
  const triangles: StlTriangle[] = [];

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

  return createAsciiStlFromTriangles(triangles);
}

function createBinaryStlFromTriangles(triangles: StlTriangle[]): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);

  triangles.forEach((triangle, triangleIndex) => {
    const triangleOffset = 84 + triangleIndex * 50;
    triangle.normal.forEach((value, componentIndex) => {
      view.setFloat32(triangleOffset + componentIndex * 4, value, true);
    });
    triangle.vertices.forEach((vertex, vertexIndex) => {
      const vertexOffset = triangleOffset + 12 + vertexIndex * 12;
      vertex.forEach((value, componentIndex) => {
        view.setFloat32(vertexOffset + componentIndex * 4, value, true);
      });
    });
    view.setUint16(triangleOffset + 48, 0, true);
  });

  return buffer;
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

function createIndexedQuadGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      Float32Array.from([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
        1, 1, 0,
      ]),
      3,
    ),
  );
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  return geometry;
}

function createNonTriangleGeometry(): BufferGeometry {
  const geometry = createIndexedQuadGeometry();
  geometry.setIndex(null);
  return geometry;
}

function firstPositionTuple(geometry: BufferGeometry): number[] {
  const position = geometry.getAttribute("position");
  return [position.getX(0), position.getY(0), position.getZ(0)];
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
    fileSize: arrayBuffer.byteLength,
  });

  return {
    id: "fixture-model",
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
      fileSize: arrayBuffer.byteLength,
    });

    expect(result.metadata.triangleCount).toBe(1);
    expect(result.metadata.fileName).toBe("triangle.stl");
    expect(result.metadata.fileSize).toBe(arrayBuffer.byteLength);
    expect(result.fit.size.x).toBeCloseTo(4);
    expect(result.fit.size.y).toBeCloseTo(0);
    expect(result.fit.size.z).toBeCloseTo(4);

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
    ).toThrow(/no usable triangles remain/);
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

  it("throws when metadata file size does not match the buffer", () => {
    const arrayBuffer = createTinyAsciiStl(1);
    expect(() =>
      parseStlArrayBuffer({
        arrayBuffer,
        fileName: "triangle.stl",
        fileSize: arrayBuffer.byteLength + 1,
      }),
    ).toThrow(/does not match content length/);
  });

  it("normalizes geometry independently and reports fit state", () => {
    const arrayBuffer = createTinyAsciiStl(2);
    const result = parseStlArrayBuffer({
      arrayBuffer,
      fileName: "double-triangle.stl",
      fileSize: arrayBuffer.byteLength,
    });

    expect(result.metadata.triangleCount).toBe(2);

    const bounds = computePositionBounds(result.geometry);
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    const spanZ = bounds.maxZ - bounds.minZ;
    expect(Math.max(spanX, spanY, spanZ)).toBeCloseTo(4);
    expect(spanY).toBeCloseTo(0);
    expect(spanZ).toBeGreaterThan(0);

    expect(result.fit.scale).toBeGreaterThan(0);
  });

  it("drops finite degenerate triangles from mixed STL before validation and normals", () => {
    const arrayBuffer = createAsciiStlFromTriangles([
      {
        normal: [0, 0, 1],
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
      },
      {
        normal: [0, 0, 1],
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
      },
      {
        normal: [0, 0, 1],
        vertices: [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
      },
    ]);

    const result = parseStlArrayBuffer({
      arrayBuffer,
      fileName: "mixed-degenerate.stl",
      fileSize: arrayBuffer.byteLength,
    });

    expect(result.metadata.triangleCount).toBe(1);
    expect(getTriangleCountFromGeometry(result.sourceGeometry)).toBe(1);
    expect(result.sourceGeometry.getAttribute("position").count).toBe(3);
    expect(result.sourceGeometry.getAttribute("normal").array.some((value) => value !== 0)).toBe(true);
  });

  it("fails when sanitation leaves no usable triangles", () => {
    const arrayBuffer = createAsciiStlFromTriangles([
      {
        normal: [0, 0, 1],
        vertices: [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
      },
      {
        normal: [0, 0, 1],
        vertices: [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
      },
    ]);

    expect(() =>
      parseStlArrayBuffer({
        arrayBuffer,
        fileName: "all-degenerate.stl",
        fileSize: arrayBuffer.byteLength,
      }),
    ).toThrow(/no usable triangles remain/);
  });

  it("keeps non-finite geometry as a hard validation error", () => {
    const arrayBuffer = createBinaryStlFromTriangles([
      {
        normal: [0, 0, 1],
        vertices: [
          [Infinity, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
      },
    ]);

    expect(() =>
      parseStlArrayBuffer({
        arrayBuffer,
        fileName: "non-finite.stl",
        fileSize: arrayBuffer.byteLength,
      }),
    ).toThrow(/non-finite value/);
  });

});

describe("geometry helpers", () => {
  it("accepts geometry that can be normalized and rejects empties", () => {
    const arrayBuffer = createTinyAsciiStl(1);
    const { geometry } = parseStlArrayBuffer({
      arrayBuffer,
      fileName: "triangle.stl",
      fileSize: arrayBuffer.byteLength,
    });

    expect(() => assertValidGeometry(geometry)).not.toThrow();
    expect(getTriangleCountFromGeometry(geometry)).toBe(1);

    const { geometry: normalized } = normalizeGeometryForDisplay(geometry);
    expect(normalized.getAttribute("position").count).toBe(3);
  });

  it("accepts valid indexed geometry and rejects non-triangle exported normalization input", () => {
    const indexed = createIndexedQuadGeometry();
    expect(() => assertValidGeometry(indexed)).not.toThrow();
    expect(getTriangleCountFromGeometry(indexed)).toBe(2);
    expect(normalizeGeometryForDisplay(indexed).geometry.getAttribute("position").count).toBe(4);

    const nonTriangle = createNonTriangleGeometry();
    expect(() => assertValidGeometry(nonTriangle)).toThrow(/position count/);
    expect(() => normalizeGeometryForDisplay(nonTriangle)).toThrow(/position count/);
  });

  it("rejects degenerate and unnormalizably tiny geometry", () => {
    const collinear = new BufferGeometry();
    collinear.setAttribute(
      "position",
      new BufferAttribute(Float32Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0]), 3),
    );

    const tiny = new BufferGeometry();
    tiny.setAttribute(
      "position",
      new BufferAttribute(Float32Array.from([0, 0, 0, 1e-20, 0, 0, 0, 1e-20, 0]), 3),
    );

    expect(() => assertValidGeometry(collinear)).toThrow(/zero or near-zero area/);
    expect(() => normalizeGeometryForDisplay(tiny)).toThrow(/too small|too large/);
  });

  it("rotates orientations with wrapping quarter-turn logic", () => {
    expect(DEFAULT_MODEL_ORIENTATION).toEqual({ operations: [{ axis: "x", quarterTurns: 3 }] });

    const quarter = rotateOrientation(DEFAULT_MODEL_ORIENTATION, "x", 4);
    expect(quarter).toEqual(DEFAULT_MODEL_ORIENTATION);

    const wrap = rotateOrientation(DEFAULT_MODEL_ORIENTATION, "y", -1);
    expect(wrap).toEqual({
      operations: [
        { axis: "x", quarterTurns: 3 },
        { axis: "y", quarterTurns: 3 },
      ],
    });

    const stepped = rotateOrientation({ operations: [{ axis: "y", quarterTurns: 2 }] }, "y", 1);
    expect(stepped).toEqual({ operations: [{ axis: "y", quarterTurns: 3 }] });
  });

  it("rebuilds from source geometry and preserves metadata and floor alignment", () => {
    const model = loadModelFixture();
    const rotated = rotateLoadedModel(model, "x", 1);

    expect(rotated.sourceGeometry).toBe(model.sourceGeometry);
    expect(rotated.metadata).toEqual(model.metadata);
    expect(rotated.fit.fittedBounds.min.y).toBeCloseTo(0);
    expect(rotated.orientation).toEqual({ operations: [] });

    const modelBounds = computePositionBounds(rotated.geometry);
    expect(modelBounds.minY).toBeCloseTo(0);
    expect(modelBounds.maxX).toBeGreaterThan(0);
    expect(rotated.fit.scale).toBeGreaterThan(0);
  });

  it("re-orients from source geometry without drifting from sequential quarter-turn calls", () => {
    const model = loadModelFixture();
    const fromCurrent = rotateLoadedModel(model, "z", 1);
    const fromCurrentTwice = rotateLoadedModel(fromCurrent, "z", 1);
    const direct = rebuildLoadedModel(model, {
      operations: [
        { axis: "x", quarterTurns: 3 },
        { axis: "z", quarterTurns: 2 },
      ],
    });

    const fromCurrentTwiceBounds = computePositionBounds(fromCurrentTwice.geometry);
    const directBounds = computePositionBounds(direct.geometry);

    expect(fromCurrentTwice.orientation).toEqual({
      operations: [
        { axis: "x", quarterTurns: 3 },
        { axis: "z", quarterTurns: 2 },
      ],
    });
    expect(fromCurrentTwiceBounds.minY).toBeCloseTo(0);
    expect(direct.fit.scale).toBeCloseTo(fromCurrentTwice.fit.scale);
    expect(fromCurrentTwiceBounds.minX).toBeCloseTo(directBounds.minX);
    expect(fromCurrentTwiceBounds.minY).toBeCloseTo(directBounds.minY);
    expect(fromCurrentTwiceBounds.maxY).toBeCloseTo(directBounds.maxY);
  });

  it("preserves mixed-axis rotation order", () => {
    const model = loadModelFixture();
    const xThenY = rotateLoadedModel(rotateLoadedModel(model, "x", 1), "y", 1);
    const yThenX = rotateLoadedModel(rotateLoadedModel(model, "y", 1), "x", 1);

    expect(xThenY.orientation.operations).toEqual([{ axis: "y", quarterTurns: 1 }]);
    expect(yThenX.orientation.operations).toEqual([
      { axis: "x", quarterTurns: 3 },
      { axis: "y", quarterTurns: 1 },
      { axis: "x", quarterTurns: 1 },
    ]);
    expect(firstPositionTuple(xThenY.geometry)).not.toEqual(firstPositionTuple(yThenX.geometry));
  });

  it("applies an orientation to raw geometry before fitting", () => {
    const geometry = createOffsetGeometry();
    const normalizedDefault = normalizeGeometryForDisplay(geometry, DEFAULT_MODEL_ORIENTATION);
    const normalizedRotated = normalizeGeometryForDisplay(geometry, { operations: [{ axis: "y", quarterTurns: 1 }] });

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
