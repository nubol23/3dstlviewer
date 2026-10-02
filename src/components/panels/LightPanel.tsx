import type { Dispatch, ReactNode } from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { ArrowDownToDot, ArrowLeftRight, Blend, Cloud, LampDesk, Lock, LockOpen, RotateCcw, Sun } from "lucide-react";
import type { AppAction, AppState, LightingMode, LightState } from "../../types";
import { LIGHT_SETUPS } from "../../state";
import { ColorControl, ControlSection, RangeControl, SwitchControl } from "../Controls";
import { IconButton } from "../IconButton";
import { SunDomeControl } from "../SunDomeControl";

const WARM_KEY_COLOR = "#ffe2b3";
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

  const applyCoolFill = () => {
    setLight({ secondaryColor: "#a8c7ef", environmentColor: "#b6c9e3" });
    dispatch({ type: "set-floor", patch: { color: "#78899f" } });
    dispatch({ type: "set-value-ramp", patch: { grayscale: false } });
  };

  const setWarmKey = (warm: boolean) => {
    setLight({ keyColor: warm ? WARM_KEY_COLOR : "#ffffff" });
    if (warm) dispatch({ type: "set-value-ramp", patch: { grayscale: false } });
  };

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
        <SwitchControl
          label="Warm Key Light"
          checked={light.keyColor.toLowerCase() === WARM_KEY_COLOR}
          onChange={setWarmKey}
          disabled={locked}
        />
        <ColorControl label="Key Color" value={light.keyColor} onChange={(keyColor) => setLight({ keyColor })} disabled={locked} />
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
          <ColorControl
            label="Second Light Color"
            value={light.secondaryColor}
            onChange={(secondaryColor) => setLight({ secondaryColor })}
            disabled={locked}
          />
        </ControlSection>
      )}

      <ControlSection title="Fill and environment">
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
        <ColorControl
          label="Environment Color"
          value={light.environmentColor}
          onChange={(environmentColor) => setLight({ environmentColor })}
          disabled={locked}
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
        {(lightingMode === "dual" || lightingMode === "reflected") && <>
          <div className="button-pair">
            <button type="button" className="btn btn--solid" disabled={locked} onClick={applyCoolFill}>Cool Blue Fill</button>
            <button type="button" className="btn btn--solid" onClick={() => dispatch({ type: "set-value-ramp", patch: { grayscale: true } })}>Monochrome</button>
          </div>
          <p className="hint">Cool Blue Fill tints the second light, sky and ground blue-gray and keeps your key color.</p>
        </>}
        <p className="hint">Environment fill is approximate in the preview.</p>
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
