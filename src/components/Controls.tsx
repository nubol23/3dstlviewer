import type { ReactNode } from "react";

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
  const display = formatValue ? formatValue(value) : `${value.toFixed(suffix === "m" ? 1 : 2)}${suffix ?? ""}`;

  return (
    <label className="slider-block">
      <span className="slider-block__label">
        <span>{label}</span>
        <span>{display}</span>
      </span>
      <input
        className="slider-block__input"
        type="range"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
      />
      <span className="slider-block__ticks">
        <span>{min}</span>
        <span>{max}</span>
      </span>
    </label>
  );
}

type ValueMode = "shaded" | "three-step" | "five-step";

type SegmentOption = {
  value: ValueMode;
  label: string;
};

type SegmentedControlProps = {
  options: readonly SegmentOption[];
  value: ValueMode;
  onChange: (next: ValueMode) => void;
  disabled?: boolean;
  testId?: string;
};

export function SegmentedControl({
  options,
  value,
  onChange,
  disabled,
  testId,
}: SegmentedControlProps) {
  return (
    <div className="segmented" role="tablist" aria-label="Value mode" data-testid={testId}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            className={`segment-btn${active ? " is-active" : ""}`}
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            aria-pressed={active}
          >
            {option.label}
          </button>
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
