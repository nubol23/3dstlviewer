import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import type CameraControlsType from "camera-controls";
import { Box3, Color, PCFShadowMap, Vector3 } from "three";
import { Floor } from "./Floor";
import { SceneLighting } from "./SceneLighting";
import { StlModel } from "./StlModel";
import type { AppState } from "../types";

export type ViewerCameraApi = {
  fitToView: () => void;
  resetView: () => void;
};

type ViewerCanvasProps = {
  state: AppState;
};

const { ACTION } = CameraControlsImpl;
const DEFAULT_TARGET = new Vector3(0, 1.2, 0);
const DEFAULT_POSITION = new Vector3(4.2, 2.8, 5.2);

export const ViewerCanvas = forwardRef<ViewerCameraApi, ViewerCanvasProps>(function ViewerCanvas({ state }, ref) {
  const controlsRef = useRef<CameraControlsType | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      fitToView() {
        fitCamera(controlsRef.current, state.model?.fit.fittedBounds);
      },
      resetView() {
        const controls = controlsRef.current;
        if (!controls) {
          return;
        }
        void controls
          .setLookAt(
            DEFAULT_POSITION.x,
            DEFAULT_POSITION.y,
            DEFAULT_POSITION.z,
            DEFAULT_TARGET.x,
            DEFAULT_TARGET.y,
            DEFAULT_TARGET.z,
            true,
          )
          .then(() => controls.saveState());
      },
    }),
    [state.model?.fit.fittedBounds],
  );

  return (
    <div className="viewer-shell" data-testid="viewer-shell">
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        camera={{ position: DEFAULT_POSITION.toArray(), fov: 38, near: 0.01, far: 100 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl, scene }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = PCFShadowMap;
          scene.background = new Color("#c9c9c6");
        }}
      >
        <CameraRig controlsRef={controlsRef} fittedBounds={state.model?.fit.fittedBounds ?? null} />
        <SceneLighting light={state.light} modelFit={state.model?.fit ?? null} />
        <Floor floor={state.floor} modelFit={state.model?.fit ?? null} />
        <StlModel
          model={state.model}
          light={state.light}
          valueMode={state.valueMode}
          valueRamp={state.valueRamp}
          zenithalStudy={state.zenithalStudy}
        />
        {!state.model && <EmptyStudyForm />}
      </Canvas>
    </div>
  );
});

type CameraRigProps = {
  controlsRef: MutableRefObject<CameraControlsType | null>;
  fittedBounds: Box3 | null;
};

function CameraRig({ controlsRef, fittedBounds }: CameraRigProps) {
  const { camera } = useThree();

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    controls.minDistance = 1.2;
    controls.maxDistance = 18;
    controls.smoothTime = 0.18;
    controls.draggingSmoothTime = 0.06;
    controls.dollySpeed = 0.8;
    void controls.setLookAt(
      DEFAULT_POSITION.x,
      DEFAULT_POSITION.y,
      DEFAULT_POSITION.z,
      DEFAULT_TARGET.x,
      DEFAULT_TARGET.y,
      DEFAULT_TARGET.z,
      false,
    );
    controls.saveState();
  }, [camera, controlsRef]);

  useEffect(() => {
    fitCamera(controlsRef.current, fittedBounds);
  }, [controlsRef, fittedBounds]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      mouseButtons={{
        left: ACTION.ROTATE,
        middle: ACTION.DOLLY,
        right: ACTION.TRUCK,
        wheel: ACTION.DOLLY,
      }}
      touches={{
        one: ACTION.TOUCH_ROTATE,
        two: ACTION.TOUCH_DOLLY_TRUCK,
        three: ACTION.TOUCH_DOLLY_TRUCK,
      }}
    />
  );
}

function fitCamera(controls: CameraControlsType | null, fittedBounds: Box3 | null | undefined) {
  if (!controls) {
    return;
  }

  if (!fittedBounds) {
    void controls.reset(true);
    return;
  }

  controls.normalizeRotations();
  void controls.fitToBox(fittedBounds, true, {
    paddingTop: 0.55,
    paddingBottom: 0.55,
    paddingLeft: 0.75,
    paddingRight: 0.75,
  });
}

function EmptyStudyForm() {
  const bevel = useMemo(() => new Color("#777773"), []);

  return (
    <group position={[0, 0.05, 0]} data-testid="empty-study-form">
      <mesh castShadow receiveShadow position={[0, 0.34, 0]}>
        <icosahedronGeometry args={[1.15, 2]} />
        <meshStandardMaterial color={bevel} roughness={0.9} metalness={0} />
      </mesh>
      <mesh receiveShadow position={[0, 0.04, 0]}>
        <cylinderGeometry args={[1.45, 1.55, 0.16, 80]} />
        <meshStandardMaterial color="#8a8a85" roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}
