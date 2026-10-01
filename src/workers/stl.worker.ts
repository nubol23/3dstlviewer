import { BufferAttribute } from "three";
import { parseStlSource } from "../lib/stl";

globalThis.onmessage = event => {
  try {
    const result = parseStlSource(event.data, phase => globalThis.postMessage({ phase }));
    const attributes = Object.entries(result.sourceGeometry.attributes).map(([name, attribute]) => {
      if (!(attribute instanceof BufferAttribute)) throw new Error("Unsupported STL attribute");
      return { name, array: attribute.array, itemSize: attribute.itemSize, normalized: attribute.normalized };
    });
    const normalMs = performance.getEntriesByName("stl:normal-preparation")[0].duration;
    globalThis.postMessage({ attributes, groups: result.sourceGeometry.groups, metadata: result.metadata, normalMs }, { transfer: attributes.map(a => a.array.buffer as ArrayBuffer) });
  } catch (error) {
    globalThis.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
