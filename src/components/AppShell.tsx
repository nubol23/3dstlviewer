import type { AppAction, AppState, LoadedModel, OrientationAxis } from "../types";
import { Box, Menu, FolderOpen, RotateCcw, RotateCw, Lock, SlidersHorizontal } from "lucide-react";
import type { ChangeEvent, Dispatch, ReactNode } from "react";
import { ActionButton, RangeControl, SegmentedControl } from "./Controls";
import { IconButton } from "./IconButton";
import { SunDomeControl } from "./SunDomeControl";

const VALUE_OPTIONS = [
  { value: "shaded", label: "Shaded" },
  { value: "three-step", label: "3-Step" },
  { value: "five-step", label: "5-Step" },
] as const;

type AppShellProps = {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  onFileSelected: (file: File) => void;
  onFitToView: () => void;
  onResetView: () => void;
  onRotateModel: (axis: OrientationAxis, quarterTurns: number) => void;
  onResetModelOrientation: () => void;
  children: ReactNode;
};

const ORIENTATION_AXES: OrientationAxis[] = ["x", "y", "z"];

function FileSummary({ model }: { model: AppState["model"] }) {
  if (!model) {
    return (
      <div className="panel-card">
        <p className="muted">No STL loaded</p>
        <p className="muted-small">Load a local STL to begin.</p>
      </div>
    );
  }

  return (
    <div className="panel-card">
      <h4>{model.metadata.fileName}</h4>
      <p>{(model.metadata.fileSize / 1024).toFixed(1)} KB</p>
      <p>{model.metadata.triangleCount.toLocaleString()} tris</p>
      <p>{new Date(model.metadata.loadedAt).toLocaleTimeString()}</p>
    </div>
  );
}

function formatQuarterTurn(turn: number): string {
  const degrees = turn === 3 ? -90 : turn * 90;
  return `${degrees}°`;
}

function ModelOrientationControls({
  model,
  onRotateModel,
  onResetModelOrientation,
}: {
  model: LoadedModel | null;
  onRotateModel: (axis: OrientationAxis, quarterTurns: number) => void;
  onResetModelOrientation: () => void;
}) {
  const disabled = !model;

  return (
    <div className="orientation-control" data-testid="model-orientation-control">
      <div className="orientation-control__readout" aria-label="Model orientation">
        {ORIENTATION_AXES.map((axis) => (
          <span key={axis}>
            {axis.toUpperCase()} {formatQuarterTurn(model?.orientation[axis] ?? 0)}
          </span>
        ))}
      </div>
      <div className="orientation-control__grid">
        {ORIENTATION_AXES.map((axis) => (
          <div className="orientation-control__axis" key={axis}>
            <span>{axis.toUpperCase()}</span>
            <button
              type="button"
              onClick={() => onRotateModel(axis, -1)}
              disabled={disabled}
              data-testid={`rotate-${axis}-negative`}
              aria-label={`Rotate ${axis.toUpperCase()} negative 90 degrees`}
            >
              <RotateCcw size={14} />
              <span>-90°</span>
            </button>
            <button
              type="button"
              onClick={() => onRotateModel(axis, 1)}
              disabled={disabled}
              data-testid={`rotate-${axis}-positive`}
              aria-label={`Rotate ${axis.toUpperCase()} positive 90 degrees`}
            >
              <RotateCw size={14} />
              <span>+90°</span>
            </button>
          </div>
        ))}
      </div>
      <button
        className="orientation-control__reset"
        type="button"
        onClick={onResetModelOrientation}
        disabled={disabled}
        data-testid="reset-model-orientation-button"
      >
        Reset Orientation
      </button>
    </div>
  );
}

export function AppShell({
  state,
  dispatch,
  onFileSelected,
  onFitToView,
  onResetView,
  onRotateModel,
  onResetModelOrientation,
  children,
}: AppShellProps) {
  const lightLocked = state.light.locked;

  const handleLockToggle = () => {
    dispatch({ type: "toggle-lock" });
  };

  const handleLightChange = (patch: Partial<AppState["light"]>) => {
    dispatch({ type: "set-light", patch });
  };

  const setFloor = (patch: Partial<AppState["floor"]>) => {
    dispatch({ type: "set-floor", patch });
  };

  const setValueMode = (valueMode: AppState["valueMode"]) => {
    dispatch({ type: "set-value-mode", valueMode });
  };

  const loadPreset = (presetId: string) => {
    dispatch({ type: "load-preset", presetId });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (file) {
      onFileSelected(file);
    }
  };

  return (
    <div className="app-shell">
      <header className="toolbar desktop-toolbar">
        <div className="toolbar__brand">
          <Box size={24} className="brand-mark" />
          <span className="toolbar__title">Miniature Light Studio</span>
        </div>
        <div className="toolbar__actions">
          <label className="toolbar__file">
            <FolderOpen size={16} />
            Open STL
            <input id="stl-file-input" data-testid="stl-file-input" type="file" accept=".stl" hidden onChange={handleFileChange} />
          </label>
          <IconButton icon={<RotateCcw size={16} />} onClick={onResetView} data-testid="reset-view-button">
            Reset View
          </IconButton>
          <IconButton icon={<Lock size={16} />} onClick={handleLockToggle} isActive={lightLocked} data-testid="lock-light-button">
            Lock Light
          </IconButton>
          <SegmentedControl options={VALUE_OPTIONS} value={state.valueMode} onChange={setValueMode} testId="value-mode-control" />
        </div>
      </header>

      <header className="toolbar mobile-toolbar">
        <button className="mobile-toolbar__menu" type="button">
          <Menu size={18} />
        </button>
        <div className="mobile-toolbar__brand">
          <Box size={24} />
          <span>
            <strong>STL Viewer</strong>
            <small>Value Study</small>
          </span>
        </div>
        <div className="mobile-toolbar__actions">
          <label className="toolbar__file">
            <FolderOpen size={16} />
            <input data-testid="mobile-stl-file-input" type="file" accept=".stl" hidden onChange={handleFileChange} />
          </label>
          <button className="mobile-toolbar__icon" type="button" onClick={onResetView} aria-label="Reset View">
            <RotateCcw size={16} />
          </button>
          <button
            className={`mobile-toolbar__icon${lightLocked ? " is-active" : ""}`}
            type="button"
            onClick={handleLockToggle}
            aria-label="Lock Light"
          >
            <Lock size={16} />
          </button>
        </div>
      </header>

      <div className="workbench">
        <aside className="panel panel-left">
          <section className="panel-section">
            <div className="panel-section__header">
              <h3>Model</h3>
              <span className="status-chip">{state.model ? "Loaded" : "Empty"}</span>
            </div>
            <FileSummary model={state.model} />
            {state.isLoading && (
              <div className="status-line" data-testid="loading-state">
                Loading STL...
              </div>
            )}
            {state.error && (
              <div className="error-banner" data-testid="load-error">
                {state.error}
              </div>
            )}
            <div className="button-row">
              <button type="button" onClick={onFitToView} disabled={!state.model} data-testid="fit-view-button">
                Fit to View
              </button>
              <button type="button" onClick={onResetView} data-testid="panel-reset-view-button">
                Reset View
              </button>
            </div>
            <div className="panel-section__header">
              <h3>Orientation</h3>
            </div>
            <ModelOrientationControls
              model={state.model}
              onRotateModel={onRotateModel}
              onResetModelOrientation={onResetModelOrientation}
            />
          </section>

          <section className="panel-section">
            <div className="panel-section__header">
              <h3>Floor</h3>
            </div>
            <label className="floor-color">
              <span>Floor Color</span>
              <input type="color" value={state.floor.color} onChange={(event) => setFloor({ color: event.target.value })} />
            </label>
            <RangeControl
              label="Material Roughness"
              min={0.05}
              max={1}
              step={0.01}
              value={state.floor.roughness}
              onChange={(value) => setFloor({ roughness: value })}
              testId="floor-roughness-slider"
              formatValue={(value) => value.toFixed(2)}
            />
          </section>

          <section className="panel-section">
            <div className="panel-section__header">
              <h3>Presets</h3>
              <ActionButton
                icon={<SlidersHorizontal size={14} />}
                label="Save"
                onClick={() => dispatch({ type: "save-preset" })}
                disabled={lightLocked}
              />
            </div>
            <div className="preset-list">
              {state.presets.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className="preset-item"
                  onClick={() => loadPreset(preset.id)}
                  disabled={lightLocked}
                  title={preset.name}
                >
                  <span>{preset.name}</span>
                  <span>{preset.valueMode}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="viewport">
          {children}
          <div className="mobile-mode-segmented">
            <SegmentedControl options={VALUE_OPTIONS} value={state.valueMode} onChange={setValueMode} testId="mobile-value-mode-control" />
          </div>
        </main>

        <aside className="panel panel-right desktop-only">
          <section className="panel-section">
            <div className="panel-section__header">
              <h3>Lighting</h3>
              <button type="button" onClick={() => dispatch({ type: "reset-light" })} disabled={lightLocked} data-testid="reset-light-button">
                Reset Light
              </button>
            </div>
            <SunDomeControl light={state.light} onChange={handleLightChange} disabled={lightLocked} />
          </section>
        </aside>
      </div>

      <section className="mobile-sheet">
        <div className="mobile-sheet__tabs" role="tablist">
          <button
            type="button"
            className={state.activeTab === "light" ? "is-active" : ""}
            onClick={() => dispatch({ type: "set-active-tab", activeTab: "light" })}
          >
            Light
          </button>
          <button
            type="button"
            className={state.activeTab === "model" ? "is-active" : ""}
            onClick={() => dispatch({ type: "set-active-tab", activeTab: "model" })}
          >
            Model
          </button>
          <button
            type="button"
            className={state.activeTab === "view" ? "is-active" : ""}
            onClick={() => dispatch({ type: "set-active-tab", activeTab: "view" })}
          >
            View
          </button>
        </div>
        <div className="mobile-sheet__body">
          {state.activeTab === "light" && <SunDomeControl light={state.light} onChange={handleLightChange} disabled={lightLocked} />}
          {state.activeTab === "model" && (
            <section className="panel-section">
              <div className="panel-section__header">
                <h3>Model</h3>
                <span className="status-chip">{state.model ? "Loaded" : "Empty"}</span>
              </div>
              <FileSummary model={state.model} />
              {state.isLoading && <div className="status-line">Loading STL...</div>}
              {state.error && <div className="error-banner">{state.error}</div>}
              <div className="button-row">
                <button type="button" onClick={onFitToView} disabled={!state.model}>
                  Fit to View
                </button>
                <button type="button" onClick={onResetView}>
                  Reset View
                </button>
              </div>
              <div className="panel-section__header">
                <h3>Orientation</h3>
              </div>
              <ModelOrientationControls
                model={state.model}
                onRotateModel={onRotateModel}
                onResetModelOrientation={onResetModelOrientation}
              />
            </section>
          )}
          {state.activeTab === "view" && (
            <div className="mobile-sheet__stack">
              <section className="panel-section">
                <h3>View</h3>
                <SegmentedControl options={VALUE_OPTIONS} value={state.valueMode} onChange={setValueMode} />
              </section>
              <section className="panel-section">
                <div className="panel-section__header">
                  <h3>Floor</h3>
                </div>
                <label className="floor-color">
                  <span>Floor Color</span>
                  <input
                    type="color"
                    value={state.floor.color}
                    onChange={(event) => setFloor({ color: event.target.value })}
                  />
                </label>
                <RangeControl
                  label="Material Roughness"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={state.floor.roughness}
                  onChange={(value) => setFloor({ roughness: value })}
                  testId="mobile-floor-roughness-slider"
                  formatValue={(value) => value.toFixed(2)}
                />
              </section>
            </div>
          )}
          {state.activeTab === "model" && (
            <section className="panel-section">
              <div className="panel-section__header">
                <h3>Presets</h3>
                <ActionButton
                  icon={<SlidersHorizontal size={14} />}
                  label="Save"
                  onClick={() => dispatch({ type: "save-preset" })}
                  disabled={lightLocked}
                />
              </div>
              <div className="preset-list">
                {state.presets.map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    className="preset-item"
                    onClick={() => loadPreset(preset.id)}
                    disabled={lightLocked}
                    title={preset.name}
                  >
                    <span>{preset.name}</span>
                    <span>{preset.valueMode}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
