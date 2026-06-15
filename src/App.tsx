import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { BufferGeometry } from "three";
import { AppShell } from "./components/AppShell";
import type { ViewerCameraApi } from "./components/ViewerCanvas";
import { ViewerCanvas } from "./components/ViewerCanvas";
import { loadStlFile, rebuildLoadedModel, rotateLoadedModel } from "./lib/stl";
import { appReducer, createInitialState, writePersistedState } from "./state";
import { DEFAULT_MODEL_ORIENTATION, type OrientationAxis } from "./types";

const LOAD_NOTICE_VISIBLE_MS = 3200;

export default function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);
  const { floor, light, presets, valueMode, valueRamp, zenithalStudy } = state;
  const cameraApiRef = useRef<ViewerCameraApi | null>(null);
  const loadRequestIdRef = useRef(0);
  const previousSourceGeometryRef = useRef<BufferGeometry | null>(null);

  const handleFileSelected = useCallback(async (file: File) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    dispatch({ type: "load-start", requestId });
    try {
      const model = await loadStlFile(file);
      dispatch({ type: "load-success", requestId, model });
      requestAnimationFrame(() => {
        if (loadRequestIdRef.current === requestId) {
          cameraApiRef.current?.fitToView();
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load STL file";
      dispatch({ type: "load-error", requestId, message });
    }
  }, []);

  const cameraActions = useMemo(
    () => ({
      fitToView: () => cameraApiRef.current?.fitToView(),
      resetView: () => cameraApiRef.current?.resetView(),
    }),
    [],
  );

  const handleRotateModel = useCallback(
    (axis: OrientationAxis, quarterTurns: number) => {
      if (!state.model) {
        return;
      }

      const model = rotateLoadedModel(state.model, axis, quarterTurns);
      dispatch({ type: "replace-model", model });
      requestAnimationFrame(() => {
        cameraApiRef.current?.fitToView();
      });
    },
    [state.model],
  );

  const handleResetModelOrientation = useCallback(() => {
    if (!state.model) {
      return;
    }

    const model = rebuildLoadedModel(state.model, DEFAULT_MODEL_ORIENTATION);
    dispatch({ type: "replace-model", model });
    requestAnimationFrame(() => {
      cameraApiRef.current?.fitToView();
    });
  }, [state.model]);

  useEffect(() => {
    writePersistedState({ floor, light, presets, valueMode, valueRamp, zenithalStudy });
  }, [floor, light, presets, valueMode, valueRamp, zenithalStudy]);

  useEffect(() => {
    if (!state.loadNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      dispatch({ type: "clear-load-notice" });
    }, LOAD_NOTICE_VISIBLE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [state.loadNotice]);

  useEffect(() => {
    const currentSourceGeometry = state.model?.sourceGeometry ?? null;
    const previousSourceGeometry = previousSourceGeometryRef.current;
    if (previousSourceGeometry && previousSourceGeometry !== currentSourceGeometry) {
      previousSourceGeometry.dispose();
    }
    previousSourceGeometryRef.current = currentSourceGeometry;
  }, [state.model?.sourceGeometry]);

  return (
    <AppShell
      state={state}
      dispatch={dispatch}
      onFileSelected={handleFileSelected}
      onFitToView={cameraActions.fitToView}
      onResetView={cameraActions.resetView}
      onRotateModel={handleRotateModel}
      onResetModelOrientation={handleResetModelOrientation}
    >
      <ViewerCanvas ref={cameraApiRef} state={state} />
    </AppShell>
  );
}
