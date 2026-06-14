import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { AppShell } from "./components/AppShell";
import type { ViewerCameraApi } from "./components/ViewerCanvas";
import { ViewerCanvas } from "./components/ViewerCanvas";
import { loadStlFile, rebuildLoadedModel, rotateLoadedModel } from "./lib/stl";
import { appReducer, createInitialState, writePersistedState } from "./state";
import { DEFAULT_MODEL_ORIENTATION, type OrientationAxis } from "./types";

export default function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);
  const cameraApiRef = useRef<ViewerCameraApi | null>(null);

  const handleFileSelected = useCallback(async (file: File) => {
    dispatch({ type: "load-start" });
    try {
      const model = await loadStlFile(file);
      dispatch({ type: "load-success", model });
      requestAnimationFrame(() => {
        cameraApiRef.current?.fitToView();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load STL file";
      dispatch({ type: "load-error", message });
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
    writePersistedState(state);
  }, [state.light, state.valueMode, state.floor, state.presets]);

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
