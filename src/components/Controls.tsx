import type { CSSProperties, ReactNode } from "react";
import { useId } from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";

type RangeControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
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
  disabled,
  formatValue,
  testId,
}: RangeControlProps) {
  if (max < min) {
    throw new Error(`Invalid range control "${label}": max must not be less than min`);
  }

  const inputId = useId();
  const inactive = disabled || max === min;
  const display = formatValue ? formatValue(value) : value.toFixed(2);
  const fillPercent = max === min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div className="range" data-disabled={inactive || undefined}>
      <div className="range__head">
        <label htmlFor={inputId}>{label}</label>
        <output htmlFor={inputId}>{display}</output>
      </div>
      <input
        id={inputId}
        className="range__input"
        type="range"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--range-fill": `${fillPercent}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={inactive}
      />
    </div>
  );
}

type SwitchControlProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
  className?: string;
};

export function SwitchControl({ label, checked, onChange, disabled, hint, className }: SwitchControlProps) {
  const hintId = useId();

  return (
    <div className={`switch${className ? ` ${className}` : ""}`} data-disabled={disabled || undefined}>
      <label className="switch__row">
        <span className="switch__label">{label}</span>
        <input
          className="switch__input"
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="switch__track" aria-hidden="true" />
      </label>
      {hint && <p id={hintId} className="hint">{hint}</p>}
    </div>
  );
}

type ColorControlProps = {
  label: string;
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
};

export function ColorControl({ label, value, onChange, disabled }: ColorControlProps) {
  const inputId = useId();

  return (
    <div className="color-field" data-disabled={disabled || undefined}>
      <label htmlFor={inputId}>{label}</label>
      <span className="color-field__value" aria-hidden="true">{value.toUpperCase()}</span>
      <input
        id={inputId}
        className="color-field__input"
        type="color"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

type SegmentOption<T extends string> = {
  value: T;
  label: string;
  content?: ReactNode;
};

type SegmentedControlProps<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  className?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <RadioGroup.Root
      className={`segmented${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
      orientation="horizontal"
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as T)}
    >
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          className="segmented__item"
          aria-label={option.label}
          value={option.value}
        >
          {option.content ?? option.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

type ControlSectionProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function ControlSection({ title, actions, children }: ControlSectionProps) {
  const headingId = useId();

  return (
    <section className="control-section" aria-labelledby={headingId}>
      <header className="control-section__head">
        <h3 id={headingId}>{title}</h3>
        {actions && <div className="control-section__actions">{actions}</div>}
      </header>
      <div className="control-section__body">{children}</div>
    </section>
  );
}
