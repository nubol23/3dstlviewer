import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { BufferGeometry } from "three";
import { Toaster, toast } from "sonner";
import { AppShell, type LoadProgress } from "./components/AppShell";
import type { RefinementStatus } from "./components/StudyPipeline";
import type { ViewerCameraApi } from "./components/ViewerCanvas";
import { ViewerCanvas } from "./components/ViewerCanvas";
import { loadStlFile, rebuildLoadedModel, rotateLoadedModel } from "./lib/stl";
import { appReducer, createInitialState, writePersistedState } from "./state";
import { DEFAULT_MODEL_ORIENTATION, type ModelOrientation, type OrientationAxis } from "./types";

const LOAD_SUCCESS_VISIBLE_MS = 3200;
const LOAD_ERROR_VISIBLE_MS = 5000;
const INITIAL_REFINEMENT: RefinementStatus = { available: false, phase: "preview", samples: 0, progress: 0 };

export default function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);
  const {
    floor,
    light,
    lightingMode,
    presets,
    renderStyle,
    valueRamp,
    valueStepCount,
  } = state;
  const cameraApiRef = useRef<ViewerCameraApi | null>(null);
  const loadRequestIdRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => loadAbortRef.current?.abort(), []);
  const previousSourceGeometryRef = useRef<BufferGeometry | null>(null);
  const [loadProgress, setLoadProgress] = useState<LoadProgress | null>(null);
  const [refinement, setRefinement] = useState<RefinementStatus>(INITIAL_REFINEMENT);
  const [orientationHistory, setOrientationHistory] = useState<ModelOrientation[]>([]);

  const fitAfterLayout = () => requestAnimationFrame(() => cameraApiRef.current?.fitToView());

  const handleFileSelected = useCallback(async (file: File) => {
    loadAbortRef.current?.abort();
    const controller = new globalThis.AbortController();
    loadAbortRef.current = controller;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    dispatch({ type: "load-start", requestId });
    setLoadProgress({ fileName: file.name, phase: "Reading file", cancel: () => controller.abort() });
    try {
      const model = await loadStlFile(file, { signal: controller.signal, onProgress: phase => {
        if (loadRequestIdRef.current === requestId) setLoadProgress(current => (current ? { ...current, phase } : current));
      } });
      if (loadRequestIdRef.current !== requestId) {
        model.geometry.dispose(); model.sourceGeometry.dispose();
        return;
      }
      dispatch({ type: "load-success", requestId, model });
      setLoadProgress(null);
      setOrientationHistory([]);
      toast.success(`Opened ${model.metadata.fileName}.`, { duration: LOAD_SUCCESS_VISIBLE_MS });
      requestAnimationFrame(() => {
        if (loadRequestIdRef.current === requestId) {
          cameraApiRef.current?.fitToView();
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load STL file";
      if (loadRequestIdRef.current !== requestId) {
        return;
      }
      dispatch({ type: "load-error", requestId, message });
      setLoadProgress(null);
      if (controller.signal.aborted) {
        toast(`Stopped opening ${file.name}.`, { duration: LOAD_SUCCESS_VISIBLE_MS });
        return;
      }
      toast.error(state.model ? `${message}. The previous model is still open.` : message, { duration: LOAD_ERROR_VISIBLE_MS });
    }
  }, [state.model]);

  const cameraActions = useMemo(
    () => ({
      fitToView: () => cameraApiRef.current?.fitToView(),
      resetView: () => cameraApiRef.current?.resetView(),
      refine: () => cameraApiRef.current?.refine(),
      stopRefinement: () => cameraApiRef.current?.stopRefinement(),
    }),
    [],
  );

  const applyOrientation = useCallback((orientation: ModelOrientation) => {
    if (!state.model) {
      return;
    }
    dispatch({ type: "replace-model", model: rebuildLoadedModel(state.model, orientation) });
    fitAfterLayout();
  }, [state.model]);

  const handleRotateModel = useCallback(
    (axis: OrientationAxis, quarterTurns: number) => {
      if (!state.model) {
        return;
      }
      setOrientationHistory(history => [...history, state.model!.orientation]);
      dispatch({ type: "replace-model", model: rotateLoadedModel(state.model, axis, quarterTurns) });
      fitAfterLayout();
    },
    [state.model],
  );

  const handleResetModelOrientation = useCallback(() => {
    if (!state.model) {
      return;
    }
    setOrientationHistory(history => [...history, state.model!.orientation]);
    applyOrientation(DEFAULT_MODEL_ORIENTATION);
  }, [applyOrientation, state.model]);

  const handleUndoOrientation = useCallback(() => {
    const previous = orientationHistory[orientationHistory.length - 1];
    if (!previous) {
      return;
    }
    setOrientationHistory(history => history.slice(0, -1));
    applyOrientation(previous);
  }, [applyOrientation, orientationHistory]);

  useEffect(() => {
    writePersistedState({
      floor,
      light,
      lightingMode,
      presets,
      renderStyle,
      valueRamp,
      valueStepCount,
    });
  }, [floor, light, lightingMode, presets, renderStyle, valueRamp, valueStepCount]);

  useEffect(() => {
    const currentSourceGeometry = state.model?.sourceGeometry ?? null;
    const previousSourceGeometry = previousSourceGeometryRef.current;
    if (previousSourceGeometry && previousSourceGeometry !== currentSourceGeometry) {
      previousSourceGeometry.dispose();
    }
    previousSourceGeometryRef.current = currentSourceGeometry;
  }, [state.model?.sourceGeometry]);

  return (
    <>
      <AppShell
        state={state}
        dispatch={dispatch}
        loadProgress={loadProgress}
        refinement={refinement}
        canUndoOrientation={orientationHistory.length > 0}
        onFileSelected={handleFileSelected}
        onFitToView={cameraActions.fitToView}
        onResetView={cameraActions.resetView}
        onRefine={cameraActions.refine}
        onStopRefinement={cameraActions.stopRefinement}
        onRotateModel={handleRotateModel}
        onUndoOrientation={handleUndoOrientation}
        onResetModelOrientation={handleResetModelOrientation}
      >
        <ViewerCanvas ref={cameraApiRef} state={state} onRefinementChange={setRefinement} />
      </AppShell>
      <Toaster
        theme="dark"
        position="top-center"
        offset={64}
        mobileOffset={{ top: 60 }}
        toastOptions={{ style: { background: "var(--panel)", borderColor: "var(--line-strong)", color: "var(--text)" } }}
      />
    </>
  );
}
