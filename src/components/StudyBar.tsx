import type { CSSProperties, Dispatch } from "react";
import { useMemo } from "react";
import type { AppAction, AppState, ValueStepCount } from "../types";
import { createValueRampColors } from "../lib/valueRamp";
import { SegmentedControl } from "./Controls";

const VALUE_STEP_COUNTS: readonly ValueStepCount[] = [3, 4, 5, 6, 7, 8];
export type StudyOption = "smooth" | `${ValueStepCount}`;
const STUDY_OPTIONS: readonly { value: StudyOption; label: string; content: string }[] = [
  { value: "smooth", label: "Smooth", content: "Smooth" },
  ...VALUE_STEP_COUNTS.map((count) => ({ value: `${count}` as StudyOption, label: `${count} values`, content: `${count}` })),
];

export function studyOptionActions(state: Pick<AppState, "renderStyle" | "valueStepCount">, option: StudyOption): AppAction[] {
  if (option === "smooth") {
    return state.renderStyle === "smooth" ? [] : [{ type: "set-render-style", renderStyle: "smooth" }];
  }
  const count = Number(option) as ValueStepCount;
  const actions: AppAction[] = [];
  if (state.renderStyle !== "stepped") actions.push({ type: "set-render-style", renderStyle: "stepped" });
  if (count !== state.valueStepCount) actions.push({ type: "set-value-step-count", valueStepCount: count });
  return actions;
}

type StudyBarProps = {
  state: AppState;
  dispatch: Dispatch<AppAction>;
};

export function StudyBar({ state, dispatch }: StudyBarProps) {
  const { renderStyle, valueStepCount, valueRamp } = state;
  const smooth = renderStyle === "smooth";
  const colors = useMemo(
    () => createValueRampColors(valueRamp, smooth ? 8 : valueStepCount),
    [smooth, valueRamp, valueStepCount],
  );

  const select = (option: StudyOption) => studyOptionActions(state, option).forEach(dispatch);

  return (
    <div className="study-bar" data-testid="value-study-control">
      <div
        className={`ramp${smooth ? " ramp--smooth" : ""}`}
        role="img"
        aria-label={smooth ? "Smooth value ramp preview" : `${valueStepCount} value ramp preview`}
        data-testid="value-ramp-preview"
        style={{ "--ramp-gradient": `linear-gradient(90deg, ${colors.join(", ")})` } as CSSProperties}
      >
        {!smooth && colors.map((color, index) => <span key={`${color}-${index}`} style={{ backgroundColor: color }} />)}
      </div>
      <SegmentedControl
        className="study-bar__options"
        options={STUDY_OPTIONS}
        value={smooth ? "smooth" : (`${valueStepCount}` as StudyOption)}
        onChange={select}
        ariaLabel="Value study"
      />
    </div>
  );
}
