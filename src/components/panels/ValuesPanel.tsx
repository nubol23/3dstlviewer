import type { Dispatch } from "react";
import { RotateCcw } from "lucide-react";
import type { AppAction, AppState, ValueRampState } from "../../types";
import { ControlSection, RangeControl, SwitchControl } from "../Controls";
import { IconButton } from "../IconButton";

type ValuesPanelProps = {
  state: AppState;
  dispatch: Dispatch<AppAction>;
};

const signed = (value: number) => (value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2));

export function ValuesPanel({ state, dispatch }: ValuesPanelProps) {
  const { valueRamp, renderStyle } = state;
  const setValueRamp = (patch: Partial<ValueRampState>) => dispatch({ type: "set-value-ramp", patch });
  const thresholds = valueRamp.thresholds;

  return (
    <div className="panel-stack" data-testid="value-ramp-control">
      <ControlSection
        title="Value range"
        actions={<IconButton icon={<RotateCcw size={16} />} label="Reset all value settings" onClick={() => dispatch({ type: "reset-value-ramp" })} />}
      >
        <RangeControl
          label="Shadow Value"
          min={5}
          max={40}
          step={1}
          value={valueRamp.shadowLightness}
          onChange={(shadowLightness) => setValueRamp({ shadowLightness })}
          testId="shadow-value-slider"
          formatValue={(value) => value.toFixed(0)}
        />
        <RangeControl
          label="Highlight Value"
          min={60}
          max={98}
          step={1}
          value={valueRamp.highlightLightness}
          onChange={(highlightLightness) => setValueRamp({ highlightLightness })}
          testId="highlight-value-slider"
          formatValue={(value) => value.toFixed(0)}
        />
        <p className="hint">Use 3–5 values to see the major light masses and 6–8 for finer transitions.</p>
      </ControlSection>

      <ControlSection title="Tone">
        <RangeControl
          label="Exposure"
          min={0.1}
          max={4}
          step={0.05}
          value={valueRamp.exposure}
          onChange={(exposure) => setValueRamp({ exposure })}
        />
        <RangeControl
          label="Contrast"
          min={1}
          max={3}
          step={0.05}
          value={valueRamp.contrast}
          onChange={(contrast) => setValueRamp({ contrast })}
        />
        <p className="hint">Separates light from shadow and keeps the dark gradations. 1.00 is neutral.</p>
        <SwitchControl
          label="Neutral Grayscale"
          checked={valueRamp.grayscale}
          onChange={(grayscale) => setValueRamp({ grayscale })}
          hint="Turn off to see the light colors in the study."
        />
      </ControlSection>

      <ControlSection title="Simplify">
        <RangeControl
          label="Smoothing Radius"
          min={0}
          max={4}
          step={0.25}
          value={valueRamp.smoothingRadius}
          onChange={(smoothingRadius) => setValueRamp({ smoothingRadius })}
          formatValue={(value) => `${value.toFixed(2)} px`}
        />
        <RangeControl
          label="Band Bias"
          min={-0.25}
          max={0.25}
          step={0.01}
          value={valueRamp.bandBias}
          onChange={(bandBias) => setValueRamp({ bandBias })}
          testId="band-bias-slider"
          formatValue={signed}
        />
        {renderStyle === "stepped" && (
          <details className="disclosure">
            <summary>Band thresholds</summary>
            <div className="disclosure__body">
              {thresholds.map((threshold, index) => (
                <RangeControl
                  key={index}
                  label={`Boundary ${index + 1}`}
                  min={index ? Math.round((thresholds[index - 1] + 0.01) * 100) / 100 : 0.01}
                  max={index < thresholds.length - 1 ? Math.round((thresholds[index + 1] - 0.01) * 100) / 100 : 0.99}
                  step={0.01}
                  value={threshold}
                  onChange={(value) => setValueRamp({ thresholds: thresholds.map((current, i) => (i === index ? value : current)) })}
                />
              ))}
            </div>
          </details>
        )}
      </ControlSection>
    </div>
  );
}
