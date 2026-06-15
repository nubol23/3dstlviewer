import { describe, expect, it } from "vitest";
import { Vector3 } from "three";

import { injectStudyShader } from "./StudyMaterial";

describe("StudyMaterial shader injection", () => {
  it("uses world-space normals for value-study sun and floor math", () => {
    const shader = {
      uniforms: {},
      vertexShader: `
#include <common>
void main() {
  #include <normal_vertex>
  #include <worldpos_vertex>
}
`,
      fragmentShader: `
#include <common>
void main() {
  vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
}
`,
    };

    injectStudyShader(shader, {
      lightDirection: new Vector3(1, 1, 0).normalize(),
      bounceStrength: 0.24,
      floorY: 0,
      floorFalloff: 1,
      stepCount: 3,
      minValue: 0.22,
      maxValue: 0.78,
    });

    expect(shader.vertexShader).toContain("varying vec3 vStudyWorldNormal");
    expect(shader.vertexShader).toContain("vStudyWorldNormal = normalize(inverseTransformDirection(transformedNormal, viewMatrix))");
    expect(shader.vertexShader).not.toContain("mat3(modelMatrix)");
    expect(shader.fragmentShader).toContain("varying vec3 vStudyWorldNormal");
    expect(shader.fragmentShader).toContain("vec3 studyNormal = normalize(vStudyWorldNormal)");
    expect(shader.fragmentShader).not.toContain("vec3 studyNormal = normalize(normal)");
    expect(shader.fragmentShader).not.toContain("shadowLift");
    expect(shader.fragmentShader).not.toContain("lightFacing * 0.32");
  });
});
