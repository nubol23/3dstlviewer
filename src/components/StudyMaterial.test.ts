import { describe, expect, it } from "vitest";
import { Color, Vector3 } from "three";

import { injectStudyShader } from "./StudyMaterial";

describe("StudyMaterial shader injection", () => {
  it("uses model-surface illumination instead of final luma for quantized value study", () => {
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
#include <shadowmap_pars_fragment>
void main() {
  vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
}
`,
    };

    injectStudyShader(shader, {
      lightDirection: new Vector3(1, 1, 0).normalize(),
      bounceStrength: 0.24,
      keyStrength: 1.25,
      floorY: 0,
      floorFalloff: 1,
      stepCount: 3,
      bandBias: 0,
      rampColors: [
        new Color("#242424"),
        new Color("#7a7a7a"),
        new Color("#e0e0e0"),
        new Color("#e0e0e0"),
        new Color("#e0e0e0"),
      ],
    });

    expect(shader.vertexShader).toContain("varying vec3 vStudyWorldNormal");
    expect(shader.vertexShader).toContain("vStudyWorldNormal = normalize(inverseTransformDirection(transformedNormal, viewMatrix))");
    expect(shader.vertexShader).not.toContain("mat3(modelMatrix)");
    expect(shader.fragmentShader).toContain("varying vec3 vStudyWorldNormal");
    expect(shader.fragmentShader).toContain("vec3 studyNormal = normalize(vStudyWorldNormal)");
    expect(shader.fragmentShader).toContain("#include <shadowmask_pars_fragment>");
    expect(shader.fragmentShader).toContain("float shadow = getShadowMask()");
    expect(shader.fragmentShader).toContain("float direct = clamp(dot(studyNormal, -uStudySunDirection), 0.0, 1.0)");
    expect(shader.fragmentShader).toContain("vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;");
    expect(shader.fragmentShader).toContain("if (uStudyModeSteps > 1)");
    expect(shader.fragmentShader).toContain("outgoingLight = getStudyRampColor(studyBand)");
    expect(shader.fragmentShader).not.toContain("vec3 studyNormal = normalize(normal)");
    expect(shader.fragmentShader).not.toContain("studyLuma");
    expect(shader.fragmentShader).not.toContain("studyLight");
    expect(shader.fragmentShader).not.toContain("shadowLift");
    expect(shader.fragmentShader).not.toContain("lightFacing * 0.32");
  });
});
