import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
  const targetX = focalTarget?.x ?? 0;
  const targetY = focalTarget?.y ?? 0;
  const targetZ = focalTarget?.z ?? 0;
  const resolvedTarget = useMemo(() => new Vector3(targetX, targetY, targetZ), [targetX, targetY, targetZ]);
  const { scene } = useThree();
  const lightRef = useRef<DirectionalLightType>(null);
  const targetRef = useRef<Object3DType>(null);
  const previousShadowMapSizeRef = useRef<number | null>(null);

  const pose = lightPoseFromState(light, resolvedTarget);
  const lightPositionX = pose.position.x;
  const lightPositionY = pose.position.y;
  const lightPositionZ = pose.position.z;
  const shadowConfig = computeDirectionalShadowConfig(effectiveFit, light.distance);

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

  useLayoutEffect(() => {
    if (!lightRef.current || !targetRef.current) {
      return;
    }

    const directional = lightRef.current;
    const targetObject = targetRef.current;
    const shadow = directional.shadow;
    const shadowCamera = shadow.camera;
    const previousShadowMapSize = previousShadowMapSizeRef.current;

    if (previousShadowMapSize !== null && previousShadowMapSize !== shadowMapSize) {
      shadow.dispose();
    }
    previousShadowMapSizeRef.current = shadowMapSize;

    directional.position.set(lightPositionX, lightPositionY, lightPositionZ);
    targetObject.position.set(targetX, targetY, targetZ);
    directional.target = targetObject;
    targetObject.updateMatrixWorld();
    directional.target.updateMatrixWorld();

    shadowCamera.near = shadowConfig.near;
    shadowCamera.far = shadowConfig.far;
    shadowCamera.left = shadowConfig.left;
    shadowCamera.right = shadowConfig.right;
    shadowCamera.top = shadowConfig.top;
    shadowCamera.bottom = shadowConfig.bottom;
    shadowCamera.updateProjectionMatrix();
    shadow.mapSize.set(shadowMapSize, shadowMapSize);
    shadow.radius = shadowRadius;
    shadow.bias = shadowBias;
    shadow.needsUpdate = true;
  }, [
    lightPositionX,
    lightPositionY,
    lightPositionZ,
    shadowBias,
    shadowConfig.bottom,
    shadowConfig.far,
    shadowConfig.left,
    shadowConfig.near,
    shadowConfig.right,
    shadowConfig.top,
    shadowMapSize,
    shadowRadius,
    targetX,
    targetY,
    targetZ,
  ]);

  return (
    <directionalLight
      ref={lightRef}
      castShadow
      position={[lightPositionX, lightPositionY, lightPositionZ]}
      intensity={intensity}
    >
      <object3D ref={targetRef} />
    </directionalLight>
  );
}
