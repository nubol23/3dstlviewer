import type { CSSProperties, ReactNode } from "react";
import { useId } from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as Slider from "@radix-ui/react-slider";

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
  if (max < min) {
    throw new Error(`Invalid range control "${label}": max must not be less than min`);
  }

  const inputId = useId();
  const display = formatValue ? formatValue(value) : `${value.toFixed(suffix === "m" ? 1 : 2)}${suffix ?? ""}`;
  const fillPercent = max === min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const inputStyle = { "--range-fill": `${fillPercent}%` } as CSSProperties;
  const handleSliderChange = (nextValue: number[]) => {
    const [next] = nextValue;
    if (next === undefined) {
      throw new Error(`Invalid range control "${label}": slider emitted no value`);
    }

    onChange(next);
  };

  return (
    <div className="slider-block">
      <label className="slider-block__label" htmlFor={inputId}>
        <span>{label}</span>
        <span>{display}</span>
      </label>
      <Slider.Root
        className="slider-block__input"
        min={min}
        max={max}
        step={step}
        value={[value]}
        style={inputStyle}
        disabled={disabled || max === min}
        onValueChange={handleSliderChange}
      >
        <Slider.Track className="slider-block__track">
          <Slider.Range className="slider-block__range" />
        </Slider.Track>
        <span aria-hidden="true" className="slider-block__thumb" />
        <input
          id={inputId}
          aria-label={label}
          className="slider-block__native-input"
          type="range"
          data-testid={testId}
          min={min}
          max={max}
          step={step}
          value={value}
          style={inputStyle}
          onChange={(event) => onChange(Number(event.target.value))}
          disabled={disabled || max === min}
        />
      </Slider.Root>
      <span className="slider-block__ticks">
        <span>{min}</span>
        <span>{max}</span>
      </span>
    </div>
  );
}

type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  name?: string;
  idPrefix?: string;
  testId?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled,
  name,
  idPrefix,
  testId,
}: SegmentedControlProps<T>) {
  const generatedName = useId();
  const radioName = name ?? `value-mode-${generatedName}`;
  const radioIdPrefix = idPrefix ?? `value-mode-option-${generatedName}`;

  return (
    <RadioGroup.Root
      className="segmented"
      aria-label={ariaLabel}
      data-testid={testId}
      disabled={disabled}
      name={radioName}
      orientation="horizontal"
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as T)}
    >
      {options.map((option) => {
        const active = option.value === value;
        const optionId = `${radioIdPrefix}-${option.value}`;
        return (
          <label
            aria-disabled={disabled || undefined}
            className={`segment-btn${active ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}
            htmlFor={optionId}
            key={option.value}
          >
            <RadioGroup.Item
              id={optionId}
              aria-label={option.label}
              className="segment-btn__item"
              value={option.value}
              disabled={disabled}
            >
              {option.label}
            </RadioGroup.Item>
          </label>
        );
      })}
    </RadioGroup.Root>
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
