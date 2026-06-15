import type { CSSProperties, ReactNode } from "react";
import { useId } from "react";
import type { ValueMode } from "../types";

type RangeControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  suffix?: string;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  testId?: string;
};

export function RangeControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
  disabled,
  formatValue,
  testId,
}: RangeControlProps) {
  if (max <= min) {
    throw new Error(`Invalid range control "${label}": max must be greater than min`);
  }

  const inputId = useId();
  const display = formatValue ? formatValue(value) : `${value.toFixed(suffix === "m" ? 1 : 2)}${suffix ?? ""}`;
  const fillPercent = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const inputStyle = { "--range-fill": `${fillPercent}%` } as CSSProperties;

  return (
    <div className="slider-block">
      <label className="slider-block__label" htmlFor={inputId}>
        <span>{label}</span>
        <span>{display}</span>
      </label>
      <input
        id={inputId}
        className="slider-block__input"
        type="range"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        style={inputStyle}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
      />
      <span className="slider-block__ticks">
        <span>{min}</span>
        <span>{max}</span>
      </span>
    </div>
  );
}

type SegmentOption = {
  value: ValueMode;
  label: string;
};

type SegmentedControlProps = {
  options: readonly SegmentOption[];
  value: ValueMode;
  onChange: (next: ValueMode) => void;
  disabled?: boolean;
  name?: string;
  idPrefix?: string;
  testId?: string;
};

export function SegmentedControl({
  options,
  value,
  onChange,
  disabled,
  name,
  idPrefix,
  testId,
}: SegmentedControlProps) {
  const generatedName = useId();
  const radioName = name ?? `value-mode-${generatedName}`;
  const radioIdPrefix = idPrefix ?? `value-mode-option-${generatedName}`;

  return (
    <div className="segmented" role="radiogroup" aria-label="Value mode" data-testid={testId}>
      {options.map((option) => {
        const active = option.value === value;
        const optionId = `${radioIdPrefix}-${option.value}`;
        return (
          <label
            className={`segment-btn${active ? " is-active" : ""}`}
            htmlFor={optionId}
            key={option.value}
          >
            <input
              id={optionId}
              className="visually-hidden"
              type="radio"
              name={radioName}
              value={option.value}
              checked={active}
              disabled={disabled}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

type ActionButtonProps = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

export function ActionButton({ icon, label, onClick, disabled }: ActionButtonProps) {
  return (
    <button className="action-btn" type="button" onClick={onClick} disabled={disabled}>
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
