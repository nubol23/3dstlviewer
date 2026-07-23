import { type ComponentProps, useEffect, useMemo, useRef } from "react";
import type { Vector3 } from "three";
import { Color, MeshLambertMaterial } from "three";

import type {
  LightingMode,
  LightState,
  ValueRampState,
  ValueRenderStyle,
  ValueStepCount,
} from "../types";
import { lightPoseFromState, resolveStudyLight } from "../lib/light";
import { createValueRampColors, DEFAULT_VALUE_RAMP } from "../lib/valueRamp";

type StudyMaterialShader = {
  uniforms: Record<string, { value: unknown }>;
};

type StudyShaderSettings = {
  lightDirection: Vector3;
  bounceStrength: number;
  keyStrength: number;
  floorY: number;
  floorFalloff: number;
  stepCount: ValueStepCount;
  bandBias: number;
  stepped: boolean;
  classicTop: boolean;
  rampColors: [Color, Color, Color, Color, Color, Color, Color, Color];
};

type StudyShaderHost = {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
};

type StudyMaterialAttributeFallbackHost = MeshLambertMaterial & {
  defaultAttributeValues?: Record<string, number[]>;
};

type StudyMaterialProps = Omit<
  ComponentProps<"meshLambertMaterial">,
  "children" | "onBeforeCompile"
> & {
  renderStyle: ValueRenderStyle;
  valueStepCount: ValueStepCount;
  valueRamp?: ValueRampState;
  light: LightState;
  lightTarget?: Vector3;
  lightingMode: LightingMode;
  floorY?: number;
  floorFalloff?: number;
};

const RAMP_UNIFORM_NAMES = [
  "uStudyRamp0",
  "uStudyRamp1",
  "uStudyRamp2",
  "uStudyRamp3",
  "uStudyRamp4",
  "uStudyRamp5",
  "uStudyRamp6",
  "uStudyRamp7",
] as const;

export function applyStudyBandAttributeFallback(material: MeshLambertMaterial): void {
  const materialWithFallbacks = material as StudyMaterialAttributeFallbackHost;
  materialWithFallbacks.defaultAttributeValues = {
    ...materialWithFallbacks.defaultAttributeValues,
    studyBand: [-1],
  };
}

export function injectStudyShader(shader: StudyShaderHost, settings: StudyShaderSettings): void {
  shader.uniforms.uStudySunDirection = { value: settings.lightDirection.clone() };
  shader.uniforms.uStudyBounceStrength = { value: settings.bounceStrength };
  shader.uniforms.uStudyKeyStrength = { value: settings.keyStrength };
  shader.uniforms.uStudyFloorY = { value: settings.floorY };
  shader.uniforms.uStudyFloorFalloff = { value: settings.floorFalloff };
  shader.uniforms.uStudyModeSteps = { value: settings.stepCount };
  shader.uniforms.uStudyBandBias = { value: settings.bandBias };
  shader.uniforms.uStudyStepped = { value: settings.stepped };
  shader.uniforms.uStudyClassicTop = { value: settings.classicTop };
  RAMP_UNIFORM_NAMES.forEach((name, index) => {
    shader.uniforms[name] = { value: settings.rampColors[index].clone() };
  });

  shader.vertexShader = shader.vertexShader.replace(
    "#include <common>",
    `
#include <common>
attribute float studyBand;
varying float vStudyBand;
varying vec3 vStudyWorldPosition;
varying vec3 vStudyWorldNormal;
`,
  );
  shader.vertexShader = shader.vertexShader.replace(
    "#include <normal_vertex>",
    `
#include <normal_vertex>
vStudyBand = studyBand;
vStudyWorldNormal = normalize(inverseTransformDirection(transformedNormal, viewMatrix));
`,
  );
  shader.vertexShader = shader.vertexShader.replace(
    "#include <worldpos_vertex>",
    `
#include <worldpos_vertex>
vStudyWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
`,
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `
#include <common>
varying float vStudyBand;
varying vec3 vStudyWorldPosition;
varying vec3 vStudyWorldNormal;
uniform vec3 uStudySunDirection;
uniform float uStudyBounceStrength;
uniform float uStudyKeyStrength;
uniform float uStudyFloorY;
uniform float uStudyFloorFalloff;
uniform int uStudyModeSteps;
uniform float uStudyBandBias;
uniform bool uStudyStepped;
uniform bool uStudyClassicTop;
uniform vec3 uStudyRamp0;
uniform vec3 uStudyRamp1;
uniform vec3 uStudyRamp2;
uniform vec3 uStudyRamp3;
uniform vec3 uStudyRamp4;
uniform vec3 uStudyRamp5;
uniform vec3 uStudyRamp6;
uniform vec3 uStudyRamp7;

vec3 getStudyRampColor(int band) {
  if (band <= 0) return uStudyRamp0;
  if (band == 1) return uStudyRamp1;
  if (band == 2) return uStudyRamp2;
  if (band == 3) return uStudyRamp3;
  if (band == 4) return uStudyRamp4;
  if (band == 5) return uStudyRamp5;
  if (band == 6) return uStudyRamp6;
  return uStudyRamp7;
}

vec3 getSmoothStudyColor(float studyValue) {
  float scaled = clamp(studyValue, 0.0, 1.0) * 7.0;
  int lowerBand = int(floor(scaled));
  int upperBand = min(lowerBand + 1, 7);
  return mix(getStudyRampColor(lowerBand), getStudyRampColor(upperBand), fract(scaled));
}
`,
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <shadowmap_pars_fragment>",
    `
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

float getStudyFloorLift(vec3 studyPosition) {
  float floorHeight = abs(studyPosition.y - uStudyFloorY);
  return exp2(-floorHeight / max(uStudyFloorFalloff, 0.0001));
}

float getStudyBounce(vec3 studyNormal, vec3 studyPosition, float direct) {
  float downFacing = clamp(-studyNormal.y, 0.0, 1.0);
  float floorLift = getStudyFloorLift(studyPosition);
  return uStudyBounceStrength * (0.12 + 0.38 * (1.0 - direct)) * (0.35 + 0.65 * downFacing) * mix(0.35, 1.0, floorLift);
}

float computeDirectionalStudyValue(vec3 studyNormal, vec3 studyPosition) {
  float direct = clamp(dot(studyNormal, -uStudySunDirection), 0.0, 1.0);
  float shadow = getShadowMask();
  float key = direct * shadow * clamp(uStudyKeyStrength, 0.0, 2.5) * 0.82;
  float bounce = getStudyBounce(studyNormal, studyPosition, direct);
  return clamp(0.05 + key + bounce, 0.0, 1.0);
}

float computeClassicTopStudyValue(vec3 studyNormal, vec3 studyPosition) {
  float overhead = clamp(studyNormal.y, 0.0, 1.0);
  float broadTop = pow(overhead, 0.65);
  float shadow = getShadowMask();
  float key = overhead * shadow * clamp(uStudyKeyStrength, 0.0, 2.5) * 0.78;
  float softTopFill = broadTop * clamp(uStudyKeyStrength, 0.0, 2.5) * 0.08;
  float bounce = getStudyBounce(studyNormal, studyPosition, overhead) * 0.35;
  return clamp(0.025 + key + softTopFill + bounce, 0.0, 1.0);
}

int computeStudyBand(float studyValue) {
  int studyBand = int(floor(studyValue * float(uStudyModeSteps)));
  return clamp(studyBand, 0, uStudyModeSteps - 1);
}

int cleanVertexStudyBand(float vertexStudyBand) {
  return clamp(int(floor(vertexStudyBand + 0.5)), 0, uStudyModeSteps - 1);
}

int resolveStudyBand(float studyValue) {
  if (vStudyBand >= 0.0) {
    return cleanVertexStudyBand(vStudyBand);
  }
  return computeStudyBand(clamp(studyValue + uStudyBandBias, 0.0, 1.0));
}
`,
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
    `
vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
vec3 studyNormal = normalize(vStudyWorldNormal);
float studyValue = uStudyClassicTop
  ? computeClassicTopStudyValue(studyNormal, vStudyWorldPosition)
  : computeDirectionalStudyValue(studyNormal, vStudyWorldPosition);

if (uStudyStepped) {
  outgoingLight = getStudyRampColor(resolveStudyBand(studyValue));
} else {
  outgoingLight = getSmoothStudyColor(studyValue);
}
`,
  );
}

export function StudyMaterial({
  renderStyle,
  valueStepCount,
  valueRamp = DEFAULT_VALUE_RAMP,
  light,
  lightTarget,
  lightingMode,
  floorY = 0,
  floorFalloff = 1,
  ...materialProps
}: StudyMaterialProps) {
  const effectiveLight = resolveStudyLight(light, lightingMode);
  const pose = lightPoseFromState(effectiveLight, lightTarget);
  const materialRef = useRef<MeshLambertMaterial>(null);
  const lightDirectionNormalized = pose.direction.clone().normalize();
  const lightDirectionX = lightDirectionNormalized.x;
  const lightDirectionY = lightDirectionNormalized.y;
  const lightDirectionZ = lightDirectionNormalized.z;

  const shaderSettings = useMemo(() => {
    const requestedColors = createValueRampColors(
      valueRamp,
      renderStyle === "smooth" ? 8 : valueStepCount,
    ).map((color) => new Color(color));
    const lastColor = requestedColors[requestedColors.length - 1];
    if (!lastColor) {
      throw new Error("Value study ramp must contain at least one color");
    }
    while (requestedColors.length < 8) {
      requestedColors.push(lastColor.clone());
    }

    return {
      stepCount: valueStepCount,
      floorFalloff: Math.max(0.1, floorFalloff),
      bandBias: valueRamp.bandBias,
      stepped: renderStyle === "stepped",
      classicTop: lightingMode === "classic-top",
      rampColors: requestedColors as StudyShaderSettings["rampColors"],
    };
  }, [
    floorFalloff,
    lightingMode,
    renderStyle,
    valueRamp,
    valueStepCount,
  ]);

  useEffect(() => {
    const shader = materialRef.current?.userData?.studyShader as
      | StudyMaterialShader
      | undefined;
    if (!shader) {
      return;
    }

    (shader.uniforms.uStudySunDirection.value as Vector3).set(
      lightDirectionX,
      lightDirectionY,
      lightDirectionZ,
    );
    shader.uniforms.uStudyBounceStrength.value = effectiveLight.bounceStrength;
    shader.uniforms.uStudyKeyStrength.value = effectiveLight.intensity;
    shader.uniforms.uStudyFloorY.value = floorY;
    shader.uniforms.uStudyFloorFalloff.value = shaderSettings.floorFalloff;
    shader.uniforms.uStudyModeSteps.value = shaderSettings.stepCount;
    shader.uniforms.uStudyBandBias.value = shaderSettings.bandBias;
    shader.uniforms.uStudyStepped.value = shaderSettings.stepped;
    shader.uniforms.uStudyClassicTop.value = shaderSettings.classicTop;
    RAMP_UNIFORM_NAMES.forEach((name, index) => {
      (shader.uniforms[name].value as Color).copy(shaderSettings.rampColors[index]);
    });
  }, [
    effectiveLight.bounceStrength,
    effectiveLight.intensity,
    floorY,
    lightDirectionX,
    lightDirectionY,
    lightDirectionZ,
    shaderSettings,
  ]);

  return (
    <meshLambertMaterial
      ref={materialRef}
      {...materialProps}
      toneMapped={false}
      onBeforeCompile={(shader: StudyShaderHost): void => {
        applyStudyBandAttributeFallback(materialRef.current!);
        injectStudyShader(shader, {
          lightDirection: lightDirectionNormalized,
          bounceStrength: effectiveLight.bounceStrength,
          keyStrength: effectiveLight.intensity,
          floorY,
          floorFalloff: shaderSettings.floorFalloff,
          stepCount: shaderSettings.stepCount,
          bandBias: shaderSettings.bandBias,
          stepped: shaderSettings.stepped,
          classicTop: shaderSettings.classicTop,
          rampColors: shaderSettings.rampColors,
        });
        materialRef.current!.userData.studyShader = shader;
      }}
    />
  );
}
