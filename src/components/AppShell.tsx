import type { ActiveTab, AppAction, AppState, LoadedModel, OrientationAxis, OrientationTurnOperation } from "../types";
import { Box, FolderOpen, RotateCcw, RotateCw, Lock, SlidersHorizontal } from "lucide-react";
import type { ChangeEvent, Dispatch, KeyboardEvent, ReactNode } from "react";
import { useId } from "react";
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
const MOBILE_TABS: Array<{ value: ActiveTab; label: string }> = [
  { value: "light", label: "Light" },
  { value: "model", label: "Model" },
  { value: "view", label: "View" },
];

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

function formatOrientationOperation(operation: OrientationTurnOperation): string {
  const direction = operation.quarterTurns === 3 ? "-" : "+";
  const degrees = operation.quarterTurns === 3 ? 90 : operation.quarterTurns * 90;
  return `${operation.axis.toUpperCase()} ${direction}${degrees}°`;
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
  const operations = model?.orientation.operations ?? [];

  return (
    <div className="orientation-control" data-testid="model-orientation-control">
      <div className="orientation-control__readout" aria-label="Model orientation">
        {operations.length ? (
          operations.map((operation, index) => (
            <span key={`${operation.axis}-${operation.quarterTurns}-${index}`}>
              {index + 1}. {formatOrientationOperation(operation)}
            </span>
          ))
        ) : (
          <span>Identity</span>
        )}
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

function FileInputControl({
  id,
  testId,
  compact = false,
  onChange,
}: {
  id: string;
  testId: string;
  compact?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="toolbar__file-control">
      <input
        id={id}
        className="toolbar__file-input visually-hidden"
        data-testid={testId}
        type="file"
        accept=".stl"
        onChange={onChange}
      />
      <label className="toolbar__file" htmlFor={id} aria-label={compact ? "Open STL" : undefined}>
        <FolderOpen size={16} />
        <span className={compact ? "visually-hidden" : undefined}>Open STL</span>
      </label>
    </div>
  );
}

function LiveRegions({ state }: { state: AppState }) {
  return (
    <div className="visually-hidden">
      <div role="status" aria-live="polite" aria-atomic="true">
        {state.isLoading ? "Loading STL..." : ""}
      </div>
      <div role="alert" aria-atomic="true">
        {state.error ?? ""}
      </div>
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
  const desktopFileInputId = useId();
  const mobileFileInputId = useId();
  const mobileTabBaseId = useId();

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

  const focusMobileTab = (tab: ActiveTab) => {
    requestAnimationFrame(() => {
      document.getElementById(`${mobileTabBaseId}-${tab}-tab`)?.focus();
    });
  };

  const setMobileTab = (activeTab: ActiveTab) => {
    dispatch({ type: "set-active-tab", activeTab });
    focusMobileTab(activeTab);
  };

  const handleMobileTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, activeTab: ActiveTab) => {
    const currentIndex = MOBILE_TABS.findIndex((tab) => tab.value === activeTab);
    const lastIndex = MOBILE_TABS.length - 1;
    let nextIndex: number | null = null;

    if (event.key === "ArrowLeft") {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    } else if (event.key === "ArrowRight") {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else if (event.key === "Enter" || event.key === " ") {
      nextIndex = currentIndex;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    setMobileTab(MOBILE_TABS[nextIndex].value);
  };

  return (
    <div className="app-shell">
      <LiveRegions state={state} />
      <header className="toolbar desktop-toolbar">
        <div className="toolbar__brand">
          <Box size={24} className="brand-mark" />
          <span className="toolbar__title">Miniature Light Studio</span>
        </div>
        <div className="toolbar__actions">
          <FileInputControl id={desktopFileInputId} testId="stl-file-input" onChange={handleFileChange} />
          <IconButton icon={<RotateCcw size={16} />} onClick={onResetView} data-testid="reset-view-button">
            Reset View
          </IconButton>
          <IconButton icon={<Lock size={16} />} onClick={handleLockToggle} isActive={lightLocked} data-testid="lock-light-button">
            Lock Light
          </IconButton>
          <SegmentedControl
            options={VALUE_OPTIONS}
            value={state.valueMode}
            onChange={setValueMode}
            name="desktop-value-mode"
            testId="value-mode-control"
          />
        </div>
      </header>

      <header className="toolbar mobile-toolbar">
        <div className="mobile-toolbar__brand">
          <Box size={24} />
          <span>
            <strong>STL Viewer</strong>
            <small>Value Study</small>
          </span>
        </div>
        <div className="mobile-toolbar__actions">
          <FileInputControl id={mobileFileInputId} testId="mobile-stl-file-input" compact onChange={handleFileChange} />
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
              <div className="status-line" data-testid="loading-state" aria-hidden="true">
                Loading STL...
              </div>
            )}
            {state.error && (
              <div className="error-banner" data-testid="load-error" aria-hidden="true">
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
            <SegmentedControl
              options={VALUE_OPTIONS}
              value={state.valueMode}
              onChange={setValueMode}
              name="mobile-overlay-value-mode"
              testId="mobile-value-mode-control"
            />
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
        <div className="mobile-sheet__tabs" role="tablist" aria-label="Mobile controls">
          {MOBILE_TABS.map((tab) => {
            const active = state.activeTab === tab.value;
            return (
              <button
                id={`${mobileTabBaseId}-${tab.value}-tab`}
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`${mobileTabBaseId}-${tab.value}-panel`}
                tabIndex={active ? 0 : -1}
                className={active ? "is-active" : ""}
                onClick={() => setMobileTab(tab.value)}
                onKeyDown={(event) => handleMobileTabKeyDown(event, tab.value)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div
          id={`${mobileTabBaseId}-${state.activeTab}-panel`}
          className="mobile-sheet__body"
          role="tabpanel"
          aria-labelledby={`${mobileTabBaseId}-${state.activeTab}-tab`}
        >
          {state.activeTab === "light" && <SunDomeControl light={state.light} onChange={handleLightChange} disabled={lightLocked} />}
          {state.activeTab === "model" && (
            <section className="panel-section">
              <div className="panel-section__header">
                <h3>Model</h3>
                <span className="status-chip">{state.model ? "Loaded" : "Empty"}</span>
              </div>
              <FileSummary model={state.model} />
              {state.isLoading && <div className="status-line" aria-hidden="true">Loading STL...</div>}
              {state.error && <div className="error-banner" aria-hidden="true">{state.error}</div>}
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
                <SegmentedControl
                  options={VALUE_OPTIONS}
                  value={state.valueMode}
                  onChange={setValueMode}
                  name="mobile-sheet-value-mode"
                />
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
