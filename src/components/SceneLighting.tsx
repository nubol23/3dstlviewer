/* eslint-disable react-hooks/immutability -- Three.js scene/renderer objects are imperative external resources, not React state. */
import { useEffect, useMemo } from "react";
import { SoftShadows } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Object3D, Vector3 } from "three";
import { GradientEquirectTexture } from "three-gpu-pathtracer/src/textures/GradientEquirectTexture.js";
import { PhysicalSpotLight } from "three-gpu-pathtracer/src/objects/PhysicalSpotLight.js";
import type { LightingMode, LightState, ModelFitState, FloorState } from "../types";
import { RENDER_BUDGETS, resolveStudyLight, sphericalToPosition } from "../lib/light";

const DEFAULT_CENTER = new Vector3(0, 2, 0);

type Props = { light: LightState; lightingMode: LightingMode; modelFit: ModelFitState | null; mobile: boolean; floor: FloorState };
export function SceneLighting({ light, lightingMode, modelFit, mobile, floor }: Props) {
  const { scene, invalidate, gl } = useThree();
  const height = modelFit?.size.y || 4;
  const radius = modelFit?.radius || 3;
  const center = modelFit?.center ?? DEFAULT_CENTER;
  const target = useMemo(() => new Object3D(), []);
  const spotlight = useMemo(() => new PhysicalSpotLight(), []);
  useEffect(() => () => spotlight.dispose(), [spotlight]);
  const environment = useMemo(() => {
    const texture = new GradientEquirectTexture(128);
    texture.topColor.set(light.environmentColor);
    texture.bottomColor.set(floor.color).multiplyScalar(floor.reflectance);
    texture.exponent = 2;
    texture.update();
    return texture;
  }, [floor.color, floor.reflectance, light.environmentColor]);
  const spread = lightingMode === "broad-zenithal" ? light.spread : 0;
  const environmentStrength = light.environmentIntensity + spread * light.intensity * 0.3;
  useEffect(() => {
    scene.environment = environment;
    return () => { scene.environment = null; environment.dispose(); };
  }, [scene, environment]);
  useEffect(() => {
    scene.environmentIntensity = environmentStrength;
    target.position.copy(center);
    target.updateMatrixWorld();
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [scene, environmentStrength, target, center, gl, invalidate, light, lightingMode, mobile]);
  const effective = resolveStudyLight(light, lightingMode);
  const directionalDistance = radius * 4;
  const position = sphericalToPosition(effective.azimuthDeg, effective.elevationDeg, lightingMode === "local" ? height * light.distance : directionalDistance).add(center);
  const secondary = sphericalToPosition(light.secondaryAzimuthDeg, light.secondaryElevationDeg, directionalDistance).add(center);
  const budget = mobile ? RENDER_BUDGETS.mobile : RENDER_BUDGETS.desktop;
  const extent = radius * 1.25;
  return <>
    <primitive object={target} />
    <SoftShadows size={light.shadowSoftness * 35} samples={budget.pcssSamples} />
    {lightingMode === "local" ? <primitive object={spotlight} radius={light.sourceSize * height}
      position={position} target={target} color={light.keyColor} intensity={light.intensity * (height * 2) ** 2}
      angle={Math.PI / 3} penumbra={0.4} decay={2} castShadow
      shadow-mapSize={[budget.primaryShadow, budget.primaryShadow]}
      shadow-camera-near={0.1} shadow-camera-far={height * 12}
      shadow-bias={-0.0001} shadow-normalBias={height * 0.001}
    /> : <directionalLight
      position={position} target={target} color={light.keyColor} intensity={light.intensity * (1 - spread)} castShadow
      shadow-mapSize={[budget.primaryShadow, budget.primaryShadow]}
      shadow-camera-left={-extent} shadow-camera-right={extent}
      shadow-camera-top={extent} shadow-camera-bottom={-extent}
      shadow-camera-near={0.1} shadow-camera-far={directionalDistance + radius * 3}
      shadow-bias={-0.0001} shadow-normalBias={height * 0.001}
    />}
    {lightingMode === "dual" && <directionalLight
      position={secondary} target={target} color={light.secondaryColor} visible={light.secondaryIntensity > 0} intensity={light.intensity * light.secondaryIntensity} castShadow
      shadow-mapSize={[budget.secondaryShadow, budget.secondaryShadow]}
      shadow-camera-left={-extent} shadow-camera-right={extent}
      shadow-camera-top={extent} shadow-camera-bottom={-extent}
      shadow-camera-near={0.1} shadow-camera-far={directionalDistance + radius * 3}
      shadow-bias={-0.0001} shadow-normalBias={height * 0.001}
    />}
    {lightingMode === "reflected" && light.reflector && <mesh position={[0, height / 2, -height]}>
      <planeGeometry args={[height * 2, height * 2]} />
      <meshPhysicalMaterial color="#cccccc" roughness={1} metalness={0} specularIntensity={0} />
    </mesh>}
  </>;
}
