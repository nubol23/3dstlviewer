import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type CameraControlsType from "camera-controls";
import { Box3, Color, PCFShadowMap, Vector3 } from "three";
import { Floor } from "./Floor";
import { SceneLighting } from "./SceneLighting";
import { StudyPipeline, type RefinementApi, type RefinementStatus } from "./StudyPipeline";
import { StlModel } from "./StlModel";
import type { AppState } from "../types";
import { MAX_DPR, MOVING_DPR_SCALE } from "../lib/light";

export type { RefinementStatus };

export type ViewerCameraApi = {
  fitToView: () => void;
  resetView: () => void;
  refine: () => void;
  stopRefinement: () => void;
};

type ViewerCanvasProps = {
  state: AppState;
  onRefinementChange: (status: RefinementStatus) => void;
};

const { ACTION } = CameraControlsImpl;
const DEFAULT_TARGET = new Vector3(0, 1.2, 0);
const DEFAULT_POSITION = new Vector3(4.2, 2.8, 5.2);
// Canvas re-applies its dpr prop on every render, so the lowered ratio while
// moving is expressed through that prop rather than set behind its back.
const TOUCH_DPR: [number, number] = [1, MAX_DPR.touch];
const TOUCH_MOVING_DPR: [number, number] = [1, MAX_DPR.touch * MOVING_DPR_SCALE];
const DESKTOP_DPR: [number, number] = [1, MAX_DPR.desktop];
// A longer restore delay than R3F's 200 ms default keeps slow phones from
// flickering between ratios when a single frame takes longer than the delay.
const PERFORMANCE = { debounce: 400 };

export const ViewerCanvas = forwardRef<ViewerCameraApi, ViewerCanvasProps>(function ViewerCanvas({ state, onRefinementChange }, ref) {
  const controlsRef = useRef<CameraControlsType | null>(null);
  const refinementRef = useRef<RefinementApi | null>(null);
  const [moving, setMoving] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 1024px), (pointer: coarse)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1024px), (pointer: coarse)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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
      refine() {
        controlsRef.current?.stop();
        refinementRef.current?.refine();
      },
      stopRefinement() {
        refinementRef.current?.stop();
      },
    }),
    [state.model?.fit.fittedBounds],
  );

  return (
    <div className="viewer-shell" data-testid="viewer-shell">
      <Canvas
        shadows
        frameloop="demand"
        dpr={mobile ? (moving ? TOUCH_MOVING_DPR : TOUCH_DPR) : DESKTOP_DPR}
        performance={PERFORMANCE}
        camera={{ position: DEFAULT_POSITION.toArray(), fov: 38, near: 0.01, far: 100 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl, scene }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.autoUpdate = false;
          gl.shadowMap.type = PCFShadowMap;
          scene.background = new Color("#c9c9c6");
        }}
      >
        <CameraRig controlsRef={controlsRef} fittedBounds={state.model?.fit.fittedBounds ?? null} regress={mobile} />
        {mobile && <MotionQuality state={state} onMovingChange={setMoving} />}
        <SceneLighting
          light={state.light}
          lightingMode={state.lightingMode}
          modelFit={state.model?.fit ?? null}
          floor={state.floor}
        />
        <Floor floor={state.floor} modelFit={state.model?.fit ?? null} />
        <StlModel model={state.model} />
        <StudyPipeline ref={refinementRef} state={state} mobile={mobile} onStatus={onRefinementChange} />
        {!state.model && <EmptyStudyForm />}
      </Canvas>
    </div>
  );
});

type CameraRigProps = {
  controlsRef: MutableRefObject<CameraControlsType | null>;
  fittedBounds: Box3 | null;
  regress: boolean;
};

type MotionQualityProps = {
  state: AppState;
  onMovingChange: (moving: boolean) => void;
};

// R3F lowers performance.current while the camera or light keeps changing and
// restores it after its debounce; the viewer follows that signal.
function MotionQuality({ state, onMovingChange }: MotionQualityProps) {
  const regress = useThree((three) => three.performance.regress);
  const current = useThree((three) => three.performance.current);
  const max = useThree((three) => three.performance.max);
  const lightChangesRef = useRef(0);
  useEffect(() => {
    lightChangesRef.current += 1;
    if (lightChangesRef.current > 1) regress();
  }, [regress, state.light, state.lightingMode, state.floor]);
  useEffect(() => {
    onMovingChange(current < max);
  }, [current, max, onMovingChange]);
  return null;
}

function CameraRig({ controlsRef, fittedBounds, regress }: CameraRigProps) {
  const { camera } = useThree();
  const performance = useThree((three) => three.performance);
  // Only user drags lower resolution. drei's regress flag also reacts to camera
  // updates, and a resolution change itself updates the camera, which loops.
  const regressOnControl = regress ? () => performance.regress() : undefined;

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
      onControlStart={regressOnControl}
      onControl={regressOnControl}
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
        <meshPhysicalMaterial color={bevel} roughness={1} metalness={0} specularIntensity={0} />
      </mesh>
      <mesh receiveShadow position={[0, 0.04, 0]}>
        <cylinderGeometry args={[1.45, 1.55, 0.16, 80]} />
        <meshPhysicalMaterial color="#8a8a85" roughness={1} metalness={0} specularIntensity={0} />
      </mesh>
    </group>
  );
}
