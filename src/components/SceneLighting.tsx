import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { DirectionalLight as DirectionalLightType, Object3D as Object3DType } from "three";

import type { LightState, ModelFitState } from "../types";
import {
  computeDirectionalShadowConfig,
  computeShadowBias,
  computeShadowMapSize,
  computeShadowRadius,
  lightPoseFromState,
} from "../lib/light";

type SceneLightingProps = {
  light: LightState;
  target?: Vector3;
  fit?: Pick<ModelFitState, "radius" | "center"> | null;
  modelFit?: Pick<ModelFitState, "radius" | "center"> | null;
};

export function SceneLighting({
  light,
  target,
  fit,
  modelFit,
}: SceneLightingProps) {
  const effectiveFit = fit ?? modelFit ?? null;
  const focalTarget = target ?? modelFit?.center ?? fit?.center ?? null;

  const resolvedTarget = useMemo(
    () => focalTarget ?? new Vector3(),
    [focalTarget?.x, focalTarget?.y, focalTarget?.z],
  );
  const { scene } = useThree();
  const lightRef = useRef<DirectionalLightType>(null);
  const targetRef = useRef<Object3DType>(null);

  const pose = useMemo(
    () => lightPoseFromState(light, resolvedTarget),
    [light.azimuthDeg, light.elevationDeg, light.distance, resolvedTarget.x, resolvedTarget.y, resolvedTarget.z],
  );

  const shadowConfig = useMemo(
    () => computeDirectionalShadowConfig(effectiveFit, light.distance),
    [effectiveFit?.radius, light.distance],
  );

  const shadowMapSize = computeShadowMapSize(light.shadowSoftness);
  const shadowRadius = computeShadowRadius(light.shadowSoftness);
  const shadowBias = computeShadowBias(light.shadowSoftness);
  const intensity = Math.max(light.intensity, 0);

  useEffect(() => {
    const directional = lightRef.current;
    const targetObject = targetRef.current;

    if (!directional || !targetObject) {
      return;
    }

    directional.target = targetObject;
    scene.add(targetObject);

    return () => {
      scene.remove(targetObject);
    };
  }, [scene]);

  useEffect(() => {
    if (!lightRef.current || !targetRef.current) {
      return;
    }

    lightRef.current.position.copy(pose.position);
    targetRef.current.position.copy(resolvedTarget);
    lightRef.current.target.updateMatrixWorld();
  }, [pose.position.x, pose.position.y, pose.position.z, resolvedTarget.x, resolvedTarget.y, resolvedTarget.z]);

  return (
    <directionalLight
      ref={lightRef}
      castShadow
      position={pose.position.toArray()}
      intensity={intensity}
      shadow-camera-near={shadowConfig.near}
      shadow-camera-far={shadowConfig.far}
      shadow-camera-left={shadowConfig.left}
      shadow-camera-right={shadowConfig.right}
      shadow-camera-top={shadowConfig.top}
      shadow-camera-bottom={shadowConfig.bottom}
      shadow-mapSize-width={shadowMapSize}
      shadow-mapSize-height={shadowMapSize}
      shadow-bias={shadowBias}
      shadow-radius={shadowRadius}
    >
      <object3D ref={targetRef} />
    </directionalLight>
  );
}
