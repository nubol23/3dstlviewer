import { type ComponentProps, useEffect, useMemo, useRef } from "react";
import type { Vector3 } from "three";
import { MeshLambertMaterial } from "three";

import type { LightState, ValueMode } from "../types";
import { lightPoseFromState } from "../lib/light";
import { getValueModeDescriptor } from "../lib/valueMode";

type StudyMaterialShader = {
  uniforms: {
    uStudySunDirection: { value: Vector3 };
    uStudyBounceStrength: { value: number };
    uStudyFloorY: { value: number };
    uStudyFloorFalloff: { value: number };
    uStudyModeSteps: { value: number };
    uStudyModeMin: { value: number };
    uStudyModeMax: { value: number };
  };
};

type StudyShaderSettings = {
  lightDirection: Vector3;
  bounceStrength: number;
  floorY: number;
  floorFalloff: number;
  stepCount: number;
  minValue: number;
  maxValue: number;
};

type StudyShaderHost = {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
};

type StudyMaterialProps = Omit<ComponentProps<"meshLambertMaterial">, "children" | "onBeforeCompile"> & {
  valueMode: ValueMode;
  lightDirection?: Vector3;
  bounceStrength?: number;
  light?: LightState;
  lightTarget?: Vector3;
  floorY?: number;
  floorFalloff?: number;
};

export function injectStudyShader(shader: StudyShaderHost, settings: StudyShaderSettings): void {
  shader.uniforms.uStudySunDirection = { value: settings.lightDirection.clone() };
  shader.uniforms.uStudyBounceStrength = { value: settings.bounceStrength };
  shader.uniforms.uStudyFloorY = { value: settings.floorY };
  shader.uniforms.uStudyFloorFalloff = { value: settings.floorFalloff };
  shader.uniforms.uStudyModeSteps = { value: settings.stepCount };
  shader.uniforms.uStudyModeMin = { value: settings.minValue };
  shader.uniforms.uStudyModeMax = { value: settings.maxValue };

  shader.vertexShader = shader.vertexShader.replace(
    "#include <common>",
    `
#include <common>
varying vec3 vStudyWorldPosition;
varying vec3 vStudyWorldNormal;
`,
  );
  shader.vertexShader = shader.vertexShader.replace(
    "#include <normal_vertex>",
    `
#include <normal_vertex>
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
varying vec3 vStudyWorldPosition;
varying vec3 vStudyWorldNormal;
uniform vec3 uStudySunDirection;
uniform float uStudyBounceStrength;
uniform float uStudyFloorY;
uniform float uStudyFloorFalloff;
uniform int uStudyModeSteps;
uniform float uStudyModeMin;
uniform float uStudyModeMax;
`,
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
    `
vec3 studyLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
float studyLuma = clamp(dot(studyLight, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
vec3 studyNormal = normalize(vStudyWorldNormal);

float downFacing = clamp(-studyNormal.y, 0.0, 1.0);
float lightFacing = clamp(dot(-uStudySunDirection, studyNormal), 0.0, 1.0);
float shadowSide = 1.0 - lightFacing;
float floorHeight = abs(vStudyWorldPosition.y - uStudyFloorY);
float floorLift = exp2(-floorHeight / max(uStudyFloorFalloff, 0.0001));
float bounce = uStudyBounceStrength * (0.18 + 0.52 * shadowSide) * (0.35 + 0.65 * downFacing) * mix(0.35, 1.0, floorLift);
float studyValue = clamp(studyLuma + bounce, 0.0, 1.0);

if (uStudyModeSteps > 1) {
  float normalized = clamp((studyValue - uStudyModeMin) / max(uStudyModeMax - uStudyModeMin, 0.0001), 0.0, 1.0);
  float levels = float(uStudyModeSteps - 1);
  float quantized = floor(normalized * levels + 0.5) / levels;
  studyValue = mix(uStudyModeMin, uStudyModeMax, quantized);
}

vec3 outgoingLight = vec3(studyValue);
`,
  );
}

export function StudyMaterial({
  valueMode,
  lightDirection,
  bounceStrength,
  light,
  lightTarget,
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

  if (lightDirection && bounceStrength !== undefined) {
    derivedDirection = lightDirection;
    derivedStrength = bounceStrength;
  } else {
    if (!light) {
      throw new Error("StudyMaterial cannot derive lighting without a light state.");
    }

    const pose = lightPoseFromState(light, lightTarget);
    derivedDirection = pose.direction;
    derivedStrength = light.bounceStrength;
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
    () => ({
      stepCount: descriptor.stepCount,
      minValue: descriptor.minValue,
      maxValue: descriptor.maxValue,
      floorFalloff: Math.max(0.1, floorFalloff),
    }),
    [descriptor.maxValue, descriptor.minValue, descriptor.stepCount, floorFalloff],
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
    shader.uniforms.uStudyFloorY.value = floorY;
    shader.uniforms.uStudyFloorFalloff.value = shaderSettings.floorFalloff;
    shader.uniforms.uStudyModeSteps.value = shaderSettings.stepCount;
    shader.uniforms.uStudyModeMin.value = shaderSettings.minValue;
    shader.uniforms.uStudyModeMax.value = shaderSettings.maxValue;
  }, [
    floorY,
    lightDirectionX,
    lightDirectionY,
    lightDirectionZ,
    shaderSettings.stepCount,
    shaderSettings.floorFalloff,
    shaderSettings.maxValue,
    shaderSettings.minValue,
    valueMode,
    derivedStrength,
  ]);

  return (
    <meshLambertMaterial
      ref={materialRef}
      {...materialProps}
      onBeforeCompile={(shader: any): void => {
        injectStudyShader(shader, {
          lightDirection: lightDirectionNormalized,
          bounceStrength: derivedStrength,
          floorY,
          floorFalloff: shaderSettings.floorFalloff,
          stepCount: shaderSettings.stepCount,
          minValue: shaderSettings.minValue,
          maxValue: shaderSettings.maxValue,
        });

        materialRef.current!.userData.studyShader = shader;
      }}
    />
  );
}
