import type { CSSProperties, Dispatch } from "react";
import { useMemo } from "react";
import * as Slider from "@radix-ui/react-slider";
import { RotateCcw } from "lucide-react";
import type { AppAction, AppState, ValueRampState } from "../../types";
import { createValueRampColors } from "../../lib/valueRamp";
import { ControlSection, RangeControl, SwitchControl } from "../Controls";
import { IconButton } from "../IconButton";

type ValuesPanelProps = {
  state: AppState;
  dispatch: Dispatch<AppAction>;
};

const signed = (value: number) => (value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2));

function bandGradient(colors: string[], thresholds: number[]): string {
  const edges = [0, ...thresholds, 1].map((edge) => `${(edge * 100).toFixed(2)}%`);
  const stops = colors.map((color, index) => `${color} ${edges[index]} ${edges[index + 1]}`);
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function ThresholdEditor({ valueRamp, count, onChange }: { valueRamp: ValueRampState; count: number; onChange: (thresholds: number[]) => void }) {
  const colors = useMemo(() => createValueRampColors(valueRamp, count), [valueRamp, count]);
  const thresholds = valueRamp.thresholds;

  return (
    <div className="threshold-editor">
      <Slider.Root
        className="threshold-editor__slider"
        min={1}
        max={99}
        step={1}
        minStepsBetweenThumbs={1}
        value={thresholds.map((threshold) => Math.round(threshold * 100))}
        onValueChange={(next) => onChange(next.map((percent, index) => (
          percent === Math.round(thresholds[index] * 100) ? thresholds[index] : percent / 100
        )))}
        aria-label="Band boundaries"
        data-testid="threshold-editor"
      >
        <Slider.Track
          className="threshold-editor__track"
          style={{ "--bands": bandGradient(colors, thresholds) } as CSSProperties}
        />
        {thresholds.map((threshold, index) => (
          <Slider.Thumb
            key={index}
            className="threshold-editor__thumb"
            aria-label={`Boundary ${index + 1}`}
            aria-valuetext={threshold.toFixed(2)}
          />
        ))}
      </Slider.Root>
      <p className="threshold-editor__values" aria-hidden="true">
        {thresholds.map((threshold) => threshold.toFixed(2)).join(" · ")}
      </p>
    </div>
  );
}

export function ValuesPanel({ state, dispatch }: ValuesPanelProps) {
  const { valueRamp, renderStyle } = state;
  const setValueRamp = (patch: Partial<ValueRampState>) => dispatch({ type: "set-value-ramp", patch });
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
      </ControlSection>

      {renderStyle === "stepped" && (
        <ControlSection title="Band boundaries">
          <ThresholdEditor
            valueRamp={valueRamp}
            count={state.valueStepCount}
            onChange={(next) => setValueRamp({ thresholds: next })}
          />
          <p className="hint">Drag a handle along the ramp, or focus it and use the arrow keys. Changing the number of values restores even boundaries.</p>
        </ControlSection>
      )}
    </div>
  );
}
