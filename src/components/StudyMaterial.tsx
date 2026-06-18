import { type ComponentProps, useEffect, useMemo, useRef } from "react";
import type { Vector3 } from "three";
import { Color, MeshLambertMaterial } from "three";

import type { LightState, ValueMode, ValueRampState } from "../types";
import { lightPoseFromState } from "../lib/light";
import { getValueModeDescriptor } from "../lib/valueMode";
import { createValueRampColors, DEFAULT_VALUE_RAMP } from "../lib/valueRamp";

type StudyMaterialShader = {
  uniforms: {
    uStudySunDirection: { value: Vector3 };
    uStudyBounceStrength: { value: number };
    uStudyKeyStrength: { value: number };
    uStudyFloorY: { value: number };
    uStudyFloorFalloff: { value: number };
    uStudyModeSteps: { value: number };
    uStudyBandBias: { value: number };
    uStudyZenithal: { value: boolean };
    uStudyRamp0: { value: Color };
    uStudyRamp1: { value: Color };
    uStudyRamp2: { value: Color };
    uStudyRamp3: { value: Color };
    uStudyRamp4: { value: Color };
  };
};

type StudyShaderSettings = {
  lightDirection: Vector3;
  bounceStrength: number;
  keyStrength: number;
  floorY: number;
  floorFalloff: number;
  stepCount: number;
  bandBias: number;
  zenithalStudy: boolean;
  rampColors: [Color, Color, Color, Color, Color];
};

type StudyShaderHost = {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
};

type StudyMaterialAttributeFallbackHost = MeshLambertMaterial & {
  defaultAttributeValues?: Record<string, number[]>;
};

type StudyMaterialProps = Omit<ComponentProps<"meshLambertMaterial">, "children" | "onBeforeCompile"> & {
  valueMode: ValueMode;
  valueRamp?: ValueRampState;
  lightDirection?: Vector3;
  bounceStrength?: number;
  keyStrength?: number;
  light?: LightState;
  lightTarget?: Vector3;
  zenithalStudy?: boolean;
  floorY?: number;
  floorFalloff?: number;
};

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
  shader.uniforms.uStudyZenithal = { value: settings.zenithalStudy };
  shader.uniforms.uStudyRamp0 = { value: settings.rampColors[0].clone() };
  shader.uniforms.uStudyRamp1 = { value: settings.rampColors[1].clone() };
  shader.uniforms.uStudyRamp2 = { value: settings.rampColors[2].clone() };
  shader.uniforms.uStudyRamp3 = { value: settings.rampColors[3].clone() };
  shader.uniforms.uStudyRamp4 = { value: settings.rampColors[4].clone() };

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
uniform bool uStudyZenithal;
uniform vec3 uStudyRamp0;
uniform vec3 uStudyRamp1;
uniform vec3 uStudyRamp2;
uniform vec3 uStudyRamp3;
uniform vec3 uStudyRamp4;

vec3 getStudyRampColor(int band) {
  if (band <= 0) {
    return uStudyRamp0;
  }
  if (band == 1) {
    return uStudyRamp1;
  }
  if (band == 2) {
    return uStudyRamp2;
  }
  if (band == 3) {
    return uStudyRamp3;
  }
  return uStudyRamp4;
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
  return clamp(0.08 + key + bounce, 0.0, 1.0);
}

float studyZenithalSample(vec3 studyNormal, vec3 lightDirection) {
  return clamp(dot(studyNormal, lightDirection), 0.0, 1.0);
}

float computeZenithalRing(vec3 studyNormal) {
  return (
    studyZenithalSample(studyNormal, vec3(0.000000, 0.707107, 0.707107)) +
    studyZenithalSample(studyNormal, vec3(0.353553, 0.707107, 0.612372)) +
    studyZenithalSample(studyNormal, vec3(0.612372, 0.707107, 0.353553)) +
    studyZenithalSample(studyNormal, vec3(0.707107, 0.707107, 0.000000)) +
    studyZenithalSample(studyNormal, vec3(0.612372, 0.707107, -0.353553)) +
    studyZenithalSample(studyNormal, vec3(0.353553, 0.707107, -0.612372)) +
    studyZenithalSample(studyNormal, vec3(0.000000, 0.707107, -0.707107)) +
    studyZenithalSample(studyNormal, vec3(-0.353553, 0.707107, -0.612372)) +
    studyZenithalSample(studyNormal, vec3(-0.612372, 0.707107, -0.353553)) +
    studyZenithalSample(studyNormal, vec3(-0.707107, 0.707107, 0.000000)) +
    studyZenithalSample(studyNormal, vec3(-0.612372, 0.707107, 0.353553)) +
    studyZenithalSample(studyNormal, vec3(-0.353553, 0.707107, 0.612372))
  ) / 12.0;
}

float computeZenithalStudyValue(vec3 studyNormal, vec3 studyPosition) {
  float ring = computeZenithalRing(studyNormal);
  float overhead = clamp(studyNormal.y, 0.0, 1.0) * 0.16;
  float key = ring * clamp(uStudyKeyStrength, 0.0, 2.5) * 0.74;
  float bounce = getStudyBounce(studyNormal, studyPosition, ring) * 0.72;
  return clamp(0.10 + key + overhead + bounce, 0.0, 1.0);
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

if (uStudyZenithal) {
  float studyValue = computeZenithalStudyValue(studyNormal, vStudyWorldPosition);
  if (uStudyModeSteps > 1) {
    int studyBand = resolveStudyBand(studyValue);
    outgoingLight = getStudyRampColor(studyBand);
  } else {
    outgoingLight = vec3(studyValue);
  }
} else if (uStudyModeSteps > 1) {
  float studyValue = computeDirectionalStudyValue(studyNormal, vStudyWorldPosition);
  int studyBand = resolveStudyBand(studyValue);
  outgoingLight = getStudyRampColor(studyBand);
}
`,
  );
}

export function StudyMaterial({
  valueMode,
  valueRamp = DEFAULT_VALUE_RAMP,
  lightDirection,
  bounceStrength,
  keyStrength,
  light,
  lightTarget,
  zenithalStudy = false,
  floorY = 0,
  floorFalloff = 1,
  ...materialProps
}: StudyMaterialProps) {
  if (!lightDirection && !light) {
    throw new Error("StudyMaterial requires either lightDirection+bounceStrength or a light state.");
  }

  const descriptor = getValueModeDescriptor(valueMode);
  let derivedDirection: Vector3;
  let derivedStrength: number;
  let derivedKeyStrength: number;

  if (lightDirection && bounceStrength !== undefined) {
    derivedDirection = lightDirection;
    derivedStrength = bounceStrength;
    derivedKeyStrength = keyStrength ?? 1.25;
  } else {
    if (!light) {
      throw new Error("StudyMaterial cannot derive lighting without a light state.");
    }

    const pose = lightPoseFromState(light, lightTarget);
    derivedDirection = pose.direction;
    derivedStrength = light.bounceStrength;
    derivedKeyStrength = light.intensity;
  }

  const materialRef = useRef<MeshLambertMaterial>(null);
  const lightDirectionNormalized = derivedDirection.clone();
  const directionMagnitude = lightDirectionNormalized.length();
  if (directionMagnitude === 0) {
    lightDirectionNormalized.set(0, 1, 0);
  } else {
    lightDirectionNormalized.divideScalar(directionMagnitude);
  }
  const lightDirectionX = lightDirectionNormalized.x;
  const lightDirectionY = lightDirectionNormalized.y;
  const lightDirectionZ = lightDirectionNormalized.z;

  const shaderSettings = useMemo(
    () => {
      const rampStepCount = descriptor.stepCount === 3 ? 3 : 5;
      const colors = createValueRampColors(valueRamp, rampStepCount);
      const rampColors =
        descriptor.stepCount === 3
          ? [
              new Color(colors[0]),
              new Color(colors[1]),
              new Color(colors[2]),
              new Color(colors[2]),
              new Color(colors[2]),
            ]
          : [
              new Color(colors[0]),
              new Color(colors[1]),
              new Color(colors[2]),
              new Color(colors[3]),
              new Color(colors[4]),
            ];

      return {
        stepCount: descriptor.stepCount,
        floorFalloff: Math.max(0.1, floorFalloff),
        bandBias: valueRamp.bandBias,
        zenithalStudy,
        rampColors: rampColors as [Color, Color, Color, Color, Color],
      };
    },
    [
      descriptor.stepCount,
      floorFalloff,
      valueRamp,
      zenithalStudy,
    ],
  );

  useEffect(() => {
    const material = materialRef.current;
    const shader = material?.userData?.studyShader as
      | StudyMaterialShader
      | undefined;

    if (!shader) {
      return;
    }

    shader.uniforms.uStudySunDirection.value.set(lightDirectionX, lightDirectionY, lightDirectionZ);
    shader.uniforms.uStudyBounceStrength.value = derivedStrength;
    shader.uniforms.uStudyKeyStrength.value = derivedKeyStrength;
    shader.uniforms.uStudyFloorY.value = floorY;
    shader.uniforms.uStudyFloorFalloff.value = shaderSettings.floorFalloff;
    shader.uniforms.uStudyModeSteps.value = shaderSettings.stepCount;
    shader.uniforms.uStudyBandBias.value = shaderSettings.bandBias;
    shader.uniforms.uStudyZenithal.value = shaderSettings.zenithalStudy;
    shader.uniforms.uStudyRamp0.value.copy(shaderSettings.rampColors[0]);
    shader.uniforms.uStudyRamp1.value.copy(shaderSettings.rampColors[1]);
    shader.uniforms.uStudyRamp2.value.copy(shaderSettings.rampColors[2]);
    shader.uniforms.uStudyRamp3.value.copy(shaderSettings.rampColors[3]);
    shader.uniforms.uStudyRamp4.value.copy(shaderSettings.rampColors[4]);
  }, [
    floorY,
    lightDirectionX,
    lightDirectionY,
    lightDirectionZ,
    shaderSettings.stepCount,
    shaderSettings.floorFalloff,
    shaderSettings.bandBias,
    shaderSettings.zenithalStudy,
    shaderSettings.rampColors,
    valueMode,
    derivedStrength,
    derivedKeyStrength,
  ]);

  return (
    <meshLambertMaterial
      ref={materialRef}
      {...materialProps}
      onBeforeCompile={(shader: any): void => {
        applyStudyBandAttributeFallback(materialRef.current!);

        injectStudyShader(shader, {
          lightDirection: lightDirectionNormalized,
          bounceStrength: derivedStrength,
          keyStrength: derivedKeyStrength,
          floorY,
          floorFalloff: shaderSettings.floorFalloff,
          stepCount: shaderSettings.stepCount,
          bandBias: shaderSettings.bandBias,
          zenithalStudy: shaderSettings.zenithalStudy,
          rampColors: shaderSettings.rampColors,
        });

        materialRef.current!.userData.studyShader = shader;
      }}
    />
  );
}
