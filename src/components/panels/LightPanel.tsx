import type { Dispatch, ReactNode } from "react";
import { useId, useState } from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { ArrowDownToDot, ArrowLeftRight, Blend, Cloud, LampDesk, Lock, LockOpen, RotateCcw, Sun } from "lucide-react";
import type { AppAction, AppState, LightingMode, LightState } from "../../types";
import { LIGHT_SETUPS } from "../../state";
import { FILL_PALETTES, KEY_COLORS, fillPalettePreset, keyColorPreset } from "../../lib/palette";
import type { FillPalette, KeyColorPreset } from "../../lib/palette";
import { ColorControl, ControlSection, RangeControl, SwitchControl } from "../Controls";
import { IconButton } from "../IconButton";
import { SunDomeControl } from "../SunDomeControl";

const ICON_SIZE = 18;

const SETUP_ICONS: Record<LightingMode, ReactNode> = {
  zenithal: <ArrowDownToDot size={ICON_SIZE} />,
  "broad-zenithal": <Cloud size={ICON_SIZE} />,
  directional: <Sun size={ICON_SIZE} />,
  local: <LampDesk size={ICON_SIZE} />,
  dual: <ArrowLeftRight size={ICON_SIZE} />,
  reflected: <Blend size={ICON_SIZE} />,
};

const ratio = (value: number) => value.toFixed(2);

const KEY_OPTIONS: Array<{ value: KeyColorPreset; label: string }> = [
  { value: "white", label: "White" },
  { value: "warm", label: "Warm" },
];

const FILL_OPTIONS: Array<{ value: FillPalette; label: string }> = [
  { value: "neutral", label: "Neutral" },
  { value: "cool", label: "Cool blue" },
];

function Swatch({ colors }: { colors: readonly string[] }) {
  return (
    <span className="swatch" aria-hidden="true">
      {colors.map((color, index) => <i key={`${color}-${index}`} style={{ backgroundColor: color }} />)}
    </span>
  );
}

function fillSwatch(palette: FillPalette): string[] {
  const colors = FILL_PALETTES[palette];
  return [colors.secondaryColor, colors.environmentColor, colors.floorColor];
}

type LightPanelProps = {
  state: AppState;
  dispatch: Dispatch<AppAction>;
};

export function LightPanel({ state, dispatch }: LightPanelProps) {
  const { light, lightingMode } = state;
  const locked = light.locked;
  const activeSetup = LIGHT_SETUPS.find((setup) => setup.lightingMode === lightingMode);
  if (!activeSetup) {
    throw new Error(`No lighting setup matches mode: ${lightingMode}`);
  }

  const setLight = (patch: Partial<LightState>) => dispatch({ type: "set-light", patch });
  const applySetup = (setupId: string) => dispatch({ type: "apply-light-setup", setupId });

  const keyPreset = keyColorPreset(light.keyColor);
  const fillPreset = fillPalettePreset(light, state.floor);
  const [fillEditorOpen, setFillEditorOpen] = useState(fillPreset === null);
  const fillEditorId = useId();
  const colorsHiddenByGrayscale = state.valueRamp.grayscale && (keyPreset !== "white" || fillPreset !== "neutral");

  return (
    <div className="panel-stack">
      <ControlSection
        title="Setup"
        actions={<>
          <IconButton
            icon={<RotateCcw size={16} />}
            label="Reset setup"
            onClick={() => applySetup(activeSetup.id)}
            disabled={locked}
            data-testid="reset-light-button"
          />
          <IconButton
            icon={locked ? <Lock size={16} /> : <LockOpen size={16} />}
            label="Lock light"
            aria-pressed={locked}
            className={locked ? "is-pressed" : undefined}
            onClick={() => dispatch({ type: "toggle-lock" })}
            data-testid="lock-light-button"
          />
        </>}
      >
        {locked && <p className="notice" role="status">Light is locked. Unlock it to change the setup, direction or presets.</p>}
        <RadioGroup.Root
          className="setup-grid"
          aria-label="Lighting setup"
          value={lightingMode}
          disabled={locked}
          onValueChange={applySetup}
          data-testid="light-setup"
        >
          {LIGHT_SETUPS.map((setup) => (
            <RadioGroup.Item key={setup.id} className="setup-card" value={setup.id}>
              <span className="setup-card__icon" aria-hidden="true">{SETUP_ICONS[setup.lightingMode]}</span>
              <span className="setup-card__name">{setup.name}</span>
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
        <p className="hint">{activeSetup.description} Choosing a setup loads its default light.</p>
      </ControlSection>

      <ControlSection title="Direction">
        <SunDomeControl light={light} onChange={setLight} disabled={locked} lightingMode={lightingMode} />
      </ControlSection>

      <ControlSection title="Key light">
        <RangeControl
          label="Intensity"
          value={light.intensity}
          min={0}
          max={10}
          step={0.01}
          onChange={(intensity) => setLight({ intensity })}
          disabled={locked}
          testId="light-intensity-slider"
          formatValue={ratio}
        />
        {lightingMode === "local" && <>
          <RangeControl
            label="Source Distance"
            value={light.distance}
            min={1}
            max={6}
            step={0.05}
            onChange={(distance) => setLight({ distance })}
            disabled={locked}
            testId="light-distance-slider"
            formatValue={(value) => `${value.toFixed(2)}× height`}
          />
          <div className="refinement-only">
            <RangeControl
              label="Source Radius · Refined"
              value={light.sourceSize}
              min={0}
              max={1}
              step={0.01}
              onChange={(sourceSize) => setLight({ sourceSize })}
              disabled={locked}
              formatValue={(value) => `${value.toFixed(2)}× height`}
            />
          </div>
        </>}
        {lightingMode === "broad-zenithal" && (
          <RangeControl
            label="Zenithal Spread"
            value={light.spread}
            min={0}
            max={1}
            step={0.01}
            onChange={(spread) => setLight({ spread })}
            disabled={locked}
          />
        )}
      </ControlSection>

      {lightingMode === "dual" && (
        <ControlSection title="Second light">
          <RangeControl
            label="Second Light Ratio"
            value={light.secondaryIntensity}
            min={0}
            max={2}
            step={0.01}
            onChange={(secondaryIntensity) => setLight({ secondaryIntensity })}
            disabled={locked}
            formatValue={(value) => `${value.toFixed(2)}× key`}
          />
          <SwitchControl
            label="Keep Second Light Opposite"
            checked={light.secondaryOpposite}
            onChange={(secondaryOpposite) => setLight({ secondaryOpposite })}
            disabled={locked}
            hint="Follows the key around the model. Its elevation stays independent."
          />
          <RangeControl
            label="Second Azimuth"
            value={light.secondaryAzimuthDeg}
            min={0}
            max={360}
            step={1}
            onChange={(secondaryAzimuthDeg) => setLight({ secondaryAzimuthDeg })}
            disabled={locked || light.secondaryOpposite}
            formatValue={(value) => `${value.toFixed(0)}°`}
          />
          <RangeControl
            label="Second Elevation"
            value={light.secondaryElevationDeg}
            min={-78}
            max={90}
            step={1}
            onChange={(secondaryElevationDeg) => setLight({ secondaryElevationDeg })}
            disabled={locked}
            formatValue={(value) => `${value.toFixed(0)}°`}
          />
        </ControlSection>
      )}

      <ControlSection title="Colors">
        <div className="palette-row">
          <span className="palette-row__label">Key light</span>
          <div className="chips">
            <RadioGroup.Root
              className="chips__group"
              aria-label="Key light color"
              value={keyPreset ?? ""}
              disabled={locked}
              onValueChange={(preset) => dispatch({ type: "set-key-color-preset", preset: preset as KeyColorPreset })}
            >
              {KEY_OPTIONS.map((option) => (
                <RadioGroup.Item key={option.value} className="chip" value={option.value}>
                  <Swatch colors={[KEY_COLORS[option.value]]} />
                  {option.label}
                </RadioGroup.Item>
              ))}
            </RadioGroup.Root>
            <label className="chip chip--picker" data-selected={keyPreset === null || undefined} data-disabled={locked || undefined}>
              <span className="chip__wheel" aria-hidden="true" />
              <input
                type="color"
                aria-label="Key Color"
                value={light.keyColor}
                disabled={locked}
                onChange={(event) => setLight({ keyColor: event.target.value })}
              />
              Custom
            </label>
          </div>
        </div>
        <div className="palette-row">
          <span className="palette-row__label">Fill, sky and floor</span>
          <div className="chips">
            <RadioGroup.Root
              className="chips__group"
              aria-label="Fill colors"
              value={fillPreset ?? ""}
              disabled={locked}
              onValueChange={(palette) => dispatch({ type: "set-fill-palette", palette: palette as FillPalette })}
            >
              {FILL_OPTIONS.map((option) => (
                <RadioGroup.Item key={option.value} className="chip" value={option.value}>
                  <Swatch colors={fillSwatch(option.value)} />
                  {option.label}
                </RadioGroup.Item>
              ))}
            </RadioGroup.Root>
            <button
              type="button"
              className="chip"
              data-selected={fillPreset === null || undefined}
              aria-expanded={fillEditorOpen}
              aria-controls={fillEditorId}
              onClick={() => setFillEditorOpen((open) => !open)}
            >
              Custom
            </button>
          </div>
          {fillEditorOpen && (
            <div id={fillEditorId} className="palette-row__editor">
              {lightingMode === "dual" && (
                <ColorControl
                  label="Second Light Color"
                  value={light.secondaryColor}
                  onChange={(secondaryColor) => setLight({ secondaryColor })}
                  disabled={locked}
                />
              )}
              <ColorControl
                label="Environment Color"
                value={light.environmentColor}
                onChange={(environmentColor) => setLight({ environmentColor })}
                disabled={locked}
              />
              <ColorControl
                label="Floor Color"
                value={state.floor.color}
                onChange={(color) => dispatch({ type: "set-floor", patch: { color } })}
                disabled={locked}
              />
            </div>
          )}
        </div>
        {colorsHiddenByGrayscale ? (
          <p className="notice notice--action">
            <span>Neutral Grayscale is on, so these colors show as gray values.</span>
            <button type="button" className="btn btn--ghost" onClick={() => dispatch({ type: "set-value-ramp", patch: { grayscale: false } })}>
              Show colors
            </button>
          </p>
        ) : (
          <p className="hint">Warm and cool choices turn on color in the study. Choosing a setup resets colors to white and neutral.</p>
        )}
      </ControlSection>

      <ControlSection title="Environment">
        <RangeControl
          label="Environment Strength"
          value={light.environmentIntensity}
          min={0}
          max={3}
          step={0.01}
          onChange={(environmentIntensity) => setLight({ environmentIntensity })}
          disabled={locked}
          testId="light-environment-slider"
          formatValue={ratio}
        />
        <RangeControl
          label="Ground Reflectance"
          min={0}
          max={1}
          step={0.01}
          value={state.floor.reflectance}
          onChange={(reflectance) => dispatch({ type: "set-floor", patch: { reflectance } })}
          disabled={locked}
          formatValue={ratio}
        />
        {lightingMode === "reflected" && (
          <SwitchControl
            className="refinement-only"
            label="Rear reflector · Refined"
            checked={light.reflector}
            onChange={(reflector) => setLight({ reflector })}
            disabled={locked}
          />
        )}
        <p className="hint">The floor bounces light onto the model and does not receive its shadow. Environment fill is approximate in the preview.</p>
      </ControlSection>

      <ControlSection title="Shadows">
        <RangeControl
          label="Shadow Softness"
          value={light.shadowSoftness}
          min={0}
          max={1}
          step={0.01}
          onChange={(shadowSoftness) => setLight({ shadowSoftness })}
          disabled={locked}
          testId="light-shadow-softness-slider"
          formatValue={ratio}
        />
        <p className="hint">Applies to every light.</p>
      </ControlSection>
    </div>
  );
}
