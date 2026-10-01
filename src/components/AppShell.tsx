import type {
  ActiveTab,
  AppAction,
  AppState,
  LoadedModel,
  LightingMode,
  OrientationAxis,
  OrientationTurnOperation,
  ValueRampState,
  ValueRenderStyle,
  ValueStepCount,
} from "../types";
import { Box, FolderOpen, RotateCcw, RotateCw, Lock, Maximize2, Minimize2, SlidersHorizontal } from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import * as Toggle from "@radix-ui/react-toggle";
import type { ChangeEvent, CSSProperties, Dispatch, ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ActionButton, RangeControl, SegmentedControl } from "./Controls";
import { IconButton } from "./IconButton";
import { SunDomeControl } from "./SunDomeControl";
import { createValueRampColors } from "../lib/valueRamp";
import { LIGHT_SETUPS } from "../state";

const RENDER_STYLE_OPTIONS = [
  { value: "smooth", label: "Smooth" },
  { value: "stepped", label: "Stepped" },
] as const;

const VALUE_STEP_COUNTS: readonly ValueStepCount[] = [3, 4, 5, 6, 7, 8];

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
        onClick={(event) => {
          event.currentTarget.value = "";
        }}
        onChange={onChange}
      />
      <label className="toolbar__file" htmlFor={id} aria-label={compact ? "Open STL" : undefined}>
        <FolderOpen size={16} />
        <span className={compact ? "visually-hidden" : undefined}>Open STL</span>
      </label>
    </div>
  );
}

function ValueRampControl({
  valueRamp,
  renderStyle,
  valueStepCount,
  onChange,
  testIdPrefix,
}: {
  valueRamp: ValueRampState;
  renderStyle: ValueRenderStyle;
  valueStepCount: ValueStepCount;
  onChange: (patch: Partial<ValueRampState>) => void;
  testIdPrefix: string;
}) {
  const previewColors = useMemo(
    () => createValueRampColors(valueRamp, renderStyle === "smooth" ? 8 : valueStepCount),
    [renderStyle, valueRamp, valueStepCount],
  );

  return (
    <div className="value-ramp-control" data-testid={`${testIdPrefix}-value-ramp-control`}>
      <div
        className={`value-ramp-preview${renderStyle === "smooth" ? " is-smooth" : ""}`}
        aria-label={
          renderStyle === "smooth"
            ? "Smooth value ramp preview"
            : `${valueStepCount} value ramp preview`
        }
        data-testid={`${testIdPrefix}-value-ramp-preview`}
        style={
          {
            "--value-count": previewColors.length,
            "--value-ramp-gradient": `linear-gradient(90deg, ${previewColors.join(", ")})`,
          } as CSSProperties
        }
      >
        {renderStyle === "stepped" &&
          previewColors.map((color, index) => (
            <span key={`${color}-${index}`} style={{ backgroundColor: color }} />
          ))}
      </div>
      <RangeControl
        label="Shadow Value"
        min={5}
        max={40}
        step={1}
        value={valueRamp.shadowLightness}
        onChange={(shadowLightness) => onChange({ shadowLightness })}
        testId={`${testIdPrefix}-shadow-value-slider`}
        formatValue={(value) => value.toFixed(0)}
      />
      <RangeControl
        label="Highlight Value"
        min={60}
        max={98}
        step={1}
        value={valueRamp.highlightLightness}
        onChange={(highlightLightness) => onChange({ highlightLightness })}
        testId={`${testIdPrefix}-highlight-value-slider`}
        formatValue={(value) => value.toFixed(0)}
      />
      <label className="control-hint"><input type="checkbox" checked={valueRamp.grayscale} onChange={e => onChange({ grayscale: e.target.checked })} /> Neutral Grayscale</label>
      <RangeControl label="Exposure" min={0.1} max={4} step={0.05} value={valueRamp.exposure} onChange={exposure => onChange({ exposure })} />
      <RangeControl label="Smoothing Radius" min={0} max={4} step={0.25} value={valueRamp.smoothingRadius} onChange={smoothingRadius => onChange({ smoothingRadius })} formatValue={v => `${v.toFixed(2)} px`} />
      <RangeControl
        label="Band Bias"
        min={-0.25}
        max={0.25}
        step={0.01}
        value={valueRamp.bandBias}
        onChange={(bandBias) => onChange({ bandBias })}
        testId={`${testIdPrefix}-band-bias-slider`}
        formatValue={(value) => (value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2))}
      />
      {renderStyle === "stepped" && <details><summary>Band thresholds</summary>
        {valueRamp.thresholds.map((threshold, index) => <RangeControl
          key={index} label={`Boundary ${index + 1}`} min={index ? Math.round((valueRamp.thresholds[index - 1] + 0.01) * 100) / 100 : 0.01}
          max={index < valueRamp.thresholds.length - 1 ? Math.round((valueRamp.thresholds[index + 1] - 0.01) * 100) / 100 : 0.99}
          step={0.01} value={threshold} onChange={value => onChange({ thresholds: valueRamp.thresholds.map((v, i) => i === index ? value : v) })}
        />)}
      </details>}
    </div>
  );
}

function ValueStudyControl({
  renderStyle,
  valueStepCount,
  onRenderStyleChange,
  onValueStepCountChange,
  testId,
}: {
  renderStyle: ValueRenderStyle;
  valueStepCount: ValueStepCount;
  onRenderStyleChange: (renderStyle: ValueRenderStyle) => void;
  onValueStepCountChange: (valueStepCount: ValueStepCount) => void;
  testId: string;
}) {
  return (
    <div className="value-study-control" data-testid={testId}>
      <SegmentedControl
        options={RENDER_STYLE_OPTIONS}
        value={renderStyle}
        onChange={onRenderStyleChange}
        ariaLabel="Value rendering"
        name={`${testId}-render-style`}
      />
      <label className="value-count-control">
        <span>Values</span>
        <select
          aria-label="Values"
          data-testid={`${testId}-value-count`}
          value={valueStepCount}
          disabled={renderStyle === "smooth"}
          onChange={(event) => onValueStepCountChange(Number(event.target.value) as ValueStepCount)}
        >
          {VALUE_STEP_COUNTS.map((count) => (
            <option key={count} value={count}>
              {count} values
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function LightingModeControl({
  lightingMode,
  onChange,
  disabled,
  name,
  testId,
}: {
  lightingMode: LightingMode;
  onChange: (lightingMode: LightingMode) => void;
  disabled: boolean;
  name: string;
  testId: string;
}) {
  return (
    <label className="light-setup-control" data-testid={testId}>
      <span>Lighting model</span>
      <select aria-label="Lighting model" name={name} value={lightingMode} disabled={disabled} onChange={e => onChange(e.target.value as LightingMode)}>
        {LIGHT_SETUPS.map(setup => <option key={setup.id} value={setup.lightingMode}>{setup.name}</option>)}
      </select>
    </label>
  );
}

function LightSetupControl({
  disabled,
  onApply,
  testId,
}: {
  disabled: boolean;
  onApply: (setupId: string) => void;
  testId: string;
}) {
  return (
    <label className="light-setup-control">
      <span>Apply Lighting Setup</span>
      <select
        aria-label="Apply Lighting Setup"
        data-testid={testId}
        disabled={disabled}
        value=""
        onChange={(event) => {
          if (event.target.value) {
            onApply(event.target.value);
          }
        }}
      >
        <option value="" disabled>
          Choose setup…
        </option>
        {LIGHT_SETUPS.map((setup) => (
          <option key={setup.id} value={setup.id}>
            {setup.name}
          </option>
        ))}
      </select>
    </label>
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
  const mobileSheetBodyRef = useRef<HTMLDivElement>(null);
  const [isViewerMaximized, setIsViewerMaximized] = useState(false);

  useEffect(() => {
    if (mobileSheetBodyRef.current) {
      mobileSheetBodyRef.current.scrollTop = 0;
    }
  }, [state.activeTab]);

  useEffect(() => {
    if (!isViewerMaximized) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsViewerMaximized(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isViewerMaximized]);

  const handleLockToggle = () => {
    dispatch({ type: "toggle-lock" });
  };

  const handleLightChange = (patch: Partial<AppState["light"]>) => {
    dispatch({ type: "set-light", patch });
  };

  const setFloor = (patch: Partial<AppState["floor"]>) => {
    dispatch({ type: "set-floor", patch });
  };

  const setRenderStyle = (renderStyle: AppState["renderStyle"]) => {
    dispatch({ type: "set-render-style", renderStyle });
  };

  const setValueStepCount = (valueStepCount: AppState["valueStepCount"]) => {
    dispatch({ type: "set-value-step-count", valueStepCount });
  };

  const setValueRamp = (patch: Partial<ValueRampState>) => {
    dispatch({ type: "set-value-ramp", patch });
  };

  const setLightingMode = (lightingMode: LightingMode) => {
    dispatch({ type: "set-lighting-mode", lightingMode });
  };

  const applyLightSetup = (setupId: string) => {
    dispatch({ type: "apply-light-setup", setupId });
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

  const setMobileTab = (activeTab: ActiveTab) => {
    dispatch({ type: "set-active-tab", activeTab });
  };

  return (
    <div className={`app-shell${isViewerMaximized ? " is-viewer-maximized" : ""}`}>
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
          <Toggle.Root
            className={`icon-btn icon-btn-ghost${lightLocked ? " is-active" : ""}`}
            pressed={lightLocked}
            onPressedChange={handleLockToggle}
            data-testid="lock-light-button"
          >
            <span className="icon-btn__icon">
              <Lock size={16} />
            </span>
            <span className="icon-btn__label">Lock Light</span>
          </Toggle.Root>
          <ValueStudyControl
            renderStyle={state.renderStyle}
            valueStepCount={state.valueStepCount}
            onRenderStyleChange={setRenderStyle}
            onValueStepCountChange={setValueStepCount}
            testId="value-study-control"
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
            className={`mobile-toolbar__icon${isViewerMaximized ? " is-active" : ""}`}
            type="button"
            onClick={() => setIsViewerMaximized((current) => !current)}
            aria-label="Maximize Viewer"
            aria-pressed={isViewerMaximized}
            data-testid="maximize-viewer-button"
          >
            {isViewerMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <Toggle.Root
            className={`mobile-toolbar__icon${lightLocked ? " is-active" : ""}`}
            pressed={lightLocked}
            onPressedChange={handleLockToggle}
            aria-label="Lock Light"
          >
            <Lock size={16} />
          </Toggle.Root>
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
              <h3>Value Ramp</h3>
            </div>
            <ValueRampControl
              valueRamp={state.valueRamp}
              renderStyle={state.renderStyle}
              valueStepCount={state.valueStepCount}
              onChange={setValueRamp}
              testIdPrefix="desktop"
            />
            <p className="control-hint">
              3–5 values simplify major light masses; 6–8 reveal finer transitions.
            </p>
          </section>

          <section className="panel-section">
            <div className="panel-section__header">
              <h3>Floor</h3>
            </div>
            <RangeControl label="Ground Reflectance" min={0} max={1} step={0.01} value={state.floor.reflectance} onChange={reflectance => setFloor({ reflectance })} />
            <label className="floor-color">
              <span>Floor Color</span>
              <input type="color" value={state.floor.color} onChange={(event) => setFloor({ color: event.target.value })} />
            </label>
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
                  <span>
                    {preset.renderStyle === "smooth" ? "smooth" : `${preset.valueStepCount} values`}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="viewport">
          {children}
        </main>

        <aside className="panel panel-right desktop-only">
          <section className="panel-section">
            <div className="panel-section__header">
              <h3>Lighting</h3>
              <button type="button" onClick={() => dispatch({ type: "reset-light" })} disabled={lightLocked} data-testid="reset-light-button">
                Reset Light
              </button>
            </div>
            <LightingModeControl
              lightingMode={state.lightingMode}
              onChange={setLightingMode}
              disabled={lightLocked}
              name="desktop-lighting-mode"
              testId="desktop-lighting-mode-control"
            />
            <LightSetupControl
              disabled={lightLocked}
              onApply={applyLightSetup}
              testId="desktop-light-setup"
            />
            <SunDomeControl
              light={state.light}
              onChange={handleLightChange}
              disabled={lightLocked}
              lightingMode={state.lightingMode}
            />
          </section>
        </aside>
      </div>

      <Tabs.Root
        className="mobile-sheet"
        value={state.activeTab}
        onValueChange={(value) => setMobileTab(value as ActiveTab)}
        hidden={isViewerMaximized}
      >
        <Tabs.List className="mobile-sheet__tabs" aria-label="Mobile controls">
          {MOBILE_TABS.map((tab) => {
            const active = state.activeTab === tab.value;
            return (
              <Tabs.Trigger
                key={tab.value}
                className={active ? "is-active" : ""}
                value={tab.value}
              >
                {tab.label}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
        <div className="mobile-sheet__body" ref={mobileSheetBodyRef}>
          <Tabs.Content value="light">
            <section className="panel-section">
              <LightingModeControl
                lightingMode={state.lightingMode}
                onChange={setLightingMode}
                disabled={lightLocked}
                name="mobile-lighting-mode"
                testId="mobile-lighting-mode-control"
              />
              <SunDomeControl
                light={state.light}
                onChange={handleLightChange}
                disabled={lightLocked}
                lightingMode={state.lightingMode}
              />
              <LightSetupControl
                disabled={lightLocked}
                onApply={applyLightSetup}
                testId="mobile-light-setup"
              />
            </section>
          </Tabs.Content>
          <Tabs.Content value="model">
            <section className="panel-section">
              <div className="panel-section__header">
                <h3>Model</h3>
                <span className="status-chip">{state.model ? "Loaded" : "Empty"}</span>
              </div>
              <FileSummary model={state.model} />
              {state.isLoading && <div className="status-line" aria-hidden="true">Loading STL...</div>}
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
                    <span>
                      {preset.renderStyle === "smooth"
                        ? "smooth"
                        : `${preset.valueStepCount} values`}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </Tabs.Content>
          <Tabs.Content value="view">
            <div className="mobile-sheet__stack">
              <section className="panel-section">
                <h3>View</h3>
                <ValueStudyControl
                  renderStyle={state.renderStyle}
                  valueStepCount={state.valueStepCount}
                  onRenderStyleChange={setRenderStyle}
                  onValueStepCountChange={setValueStepCount}
                  testId="mobile-value-study-control"
                />
                <ValueRampControl
                  valueRamp={state.valueRamp}
                  renderStyle={state.renderStyle}
                  valueStepCount={state.valueStepCount}
                  onChange={setValueRamp}
                  testIdPrefix="mobile"
                />
                <p className="control-hint">
                  3–5 values simplify major light masses; 6–8 reveal finer transitions.
                </p>
              </section>
              <section className="panel-section">
                <div className="panel-section__header">
                  <h3>Floor</h3>
                </div>
                <RangeControl label="Ground Reflectance" min={0} max={1} step={0.01} value={state.floor.reflectance} onChange={reflectance => setFloor({ reflectance })} />
            <label className="floor-color">
                  <span>Floor Color</span>
                  <input
                    type="color"
                    value={state.floor.color}
                    onChange={(event) => setFloor({ color: event.target.value })}
                  />
                </label>
              </section>
            </div>
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}
