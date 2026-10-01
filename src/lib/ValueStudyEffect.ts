import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { Uniform } from "three";
import type { ValueRampState, ValueRenderStyle, ValueStepCount } from "../types";

// The only bespoke rendering math is the painter's perceptual value mapping.
// Input is already AgX-mapped linear RGB. Output remains linear for the composer.
const fragment = `
uniform float shadowValue;
uniform float highlightValue;
uniform float bandBias;
uniform float smoothingRadius;
uniform int steps;
uniform bool stepped;
uniform bool grayscale;
uniform float thresholds[7];
float lightness(vec3 color) {
  float y = max(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.0);
  return y > 0.008856 ? 1.16 * pow(y, 1.0 / 3.0) - 0.16 : 9.03296 * y;
}
float luminanceFromLightness(float l) {
  return l > 0.08 ? pow((l + 0.16) / 1.16, 3.0) : l / 9.03296;
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float depth = readDepth(uv);
  if (depth >= 0.999999) { outputColor = inputColor; return; }
  float value = lightness(inputColor.rgb);
  if (smoothingRadius > 0.0) {
    float sum = value; float weights = 1.0;
    float z = getViewZ(depth);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      if (x == 0 && y == 0) continue;
      vec2 sampleUv = uv + vec2(float(x), float(y)) * texelSize * smoothingRadius;
      float d = readDepth(sampleUv);
      float sampleValue = lightness(texture2D(inputBuffer, sampleUv).rgb);
      float weight = exp(-abs(getViewZ(d) - z) * 100.0) * exp(-abs(sampleValue - value) * 12.0);
      weight *= d < 0.999999 ? 1.0 : 0.0;
      sum += sampleValue * weight; weights += weight;
    }
    value = sum / weights;
  }
  value = clamp(value + bandBias, 0.0, 1.0);
  if (stepped) {
    int band = 0;
    for (int i = 0; i < 7; i++) { if (i < steps - 1 && value >= thresholds[i]) band++; }
    value = float(band) / float(steps - 1);
  }
  float mapped = mix(shadowValue, highlightValue, value);
  float targetY = luminanceFromLightness(mapped);
  vec3 color = clamp(inputColor.rgb, 0.0, 1.0);
  float originalY = dot(color, vec3(0.2126, 0.7152, 0.0722));
  // Shift toward black or white to attain the study value without out-of-gamut
  // clipping. This is the artistic value presentation, after light transport.
  color = targetY > originalY
    ? mix(color, vec3(1.0), (targetY - originalY) / max(1.0 - originalY, 0.00001))
    : color * targetY / max(originalY, 0.00001);
  outputColor = vec4(grayscale ? vec3(targetY) : color, inputColor.a);
}`;

export class ValueStudyEffect extends Effect {
  constructor() {
    super("ValueStudy", fragment, { blendFunction: BlendFunction.SRC, attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ["shadowValue", new Uniform(0.08)], ["highlightValue", new Uniform(0.94)],
        ["bandBias", new Uniform(0)], ["smoothingRadius", new Uniform(1)],
        ["grayscale", new Uniform(true)],
        ["steps", new Uniform(5)], ["stepped", new Uniform(false)],
        ["thresholds", new Uniform([0.2, 0.4, 0.6, 0.8, 1, 1, 1])],
      ]),
    });
  }
  configure(ramp: ValueRampState, style: ValueRenderStyle, count: ValueStepCount) {
    this.uniforms.get("shadowValue")!.value = ramp.shadowLightness / 100;
    this.uniforms.get("highlightValue")!.value = ramp.highlightLightness / 100;
    this.uniforms.get("bandBias")!.value = ramp.bandBias;
    this.uniforms.get("smoothingRadius")!.value = ramp.smoothingRadius;
    this.uniforms.get("grayscale")!.value = ramp.grayscale;
    this.uniforms.get("steps")!.value = count;
    this.uniforms.get("stepped")!.value = style === "stepped";
    this.uniforms.get("thresholds")!.value = [...ramp.thresholds, ...Array(7 - ramp.thresholds.length).fill(1)];
  }
}
