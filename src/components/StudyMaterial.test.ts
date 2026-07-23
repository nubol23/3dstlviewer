import { describe, expect, it } from "vitest";
import { Color, MeshLambertMaterial, Vector3 } from "three";

import { applyStudyBandAttributeFallback, injectStudyShader } from "./StudyMaterial";

function createShader() {
  return {
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
}

const rampColors: [Color, Color, Color, Color, Color, Color, Color, Color] = [
  "#242424",
  "#444444",
  "#666666",
  "#888888",
  "#aaaaaa",
  "#c0c0c0",
  "#d4d4d4",
  "#e0e0e0",
].map((color) => new Color(color)) as [
  Color,
  Color,
  Color,
  Color,
  Color,
  Color,
  Color,
  Color,
];

function inject(overrides: Partial<Parameters<typeof injectStudyShader>[1]> = {}) {
  const shader = createShader();
  injectStudyShader(shader, {
    lightDirection: new Vector3(1, 1, 0).normalize(),
    bounceStrength: 0.16,
    keyStrength: 1.25,
    floorY: 0,
    floorFalloff: 1,
    stepCount: 8,
    bandBias: 0,
    stepped: true,
    classicTop: false,
    rampColors,
    ...overrides,
  });
  return shader;
}

describe("StudyMaterial shader injection", () => {
  it("uses shadowed directional surface illumination for stepped studies", () => {
    const shader = inject();

    expect(shader.vertexShader).toContain("attribute float studyBand");
    expect(shader.vertexShader).toContain("varying vec3 vStudyWorldNormal");
    expect(shader.fragmentShader).toContain("#include <shadowmask_pars_fragment>");
    expect(shader.fragmentShader).toContain("float shadow = getShadowMask()");
    expect(shader.fragmentShader).toContain(
      "float direct = clamp(dot(studyNormal, -uStudySunDirection), 0.0, 1.0)",
    );
    expect(shader.fragmentShader).toContain("if (vStudyBand >= 0.0)");
    expect(shader.fragmentShader).toContain(
      "outgoingLight = getStudyRampColor(resolveStudyBand(studyValue))",
    );
    expect(shader.fragmentShader).toContain("if (band == 6) return uStudyRamp6");
    expect(shader.fragmentShader).toContain("return uStudyRamp7");
  });

  it("uses an occlusion-aware top-weighted model instead of an all-around ring", () => {
    const shader = inject({ classicTop: true });
    const classicTop = shader.fragmentShader.slice(
      shader.fragmentShader.indexOf("float computeClassicTopStudyValue"),
      shader.fragmentShader.indexOf("int computeStudyBand"),
    );

    expect(classicTop).toContain("float overhead = clamp(studyNormal.y, 0.0, 1.0)");
    expect(classicTop).toContain("float shadow = getShadowMask()");
    expect(classicTop).toContain("float softTopFill = broadTop");
    expect(shader.fragmentShader).not.toContain("computeZenithalRing");
    expect(shader.fragmentShader).not.toContain("studyZenithalSample");
  });

  it("maps smooth illumination through the perceptual value ramp", () => {
    const shader = inject({ stepped: false });

    expect(shader.fragmentShader).toContain("vec3 getSmoothStudyColor");
    expect(shader.fragmentShader).toContain("scaled = clamp(studyValue, 0.0, 1.0) * 7.0");
    expect(shader.fragmentShader).toContain("outgoingLight = getSmoothStudyColor(studyValue)");
    expect(shader.fragmentShader).not.toContain("outgoingLight = vec3(studyValue)");
  });

  it("keeps the computed study path without a studyBand attribute", () => {
    const material = new MeshLambertMaterial();
    applyStudyBandAttributeFallback(material);
    expect(material).toHaveProperty("defaultAttributeValues.studyBand", [-1]);
  });
});
