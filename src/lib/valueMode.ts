import type { ValueMode } from "../types";

export type ValueModeDescriptor = {
  mode: ValueMode;
  stepCount: 1 | 3 | 5;
  minValue: number;
  maxValue: number;
};

export const VALUE_MODE_DESCRIPTORS: Record<ValueMode, ValueModeDescriptor> = {
  shaded: {
    mode: "shaded",
    stepCount: 1,
    minValue: 0,
    maxValue: 1,
  },
  "three-step": {
    mode: "three-step",
    stepCount: 3,
    minValue: 0.22,
    maxValue: 0.78,
  },
  "five-step": {
    mode: "five-step",
    stepCount: 5,
    minValue: 0.14,
    maxValue: 0.9,
  },
};

export function assertValueMode(mode: unknown): asserts mode is ValueMode {
  if (mode !== "shaded" && mode !== "three-step" && mode !== "five-step") {
    throw new Error(`Unsupported value mode: ${String(mode)}`);
  }
}

export function getValueModeDescriptor(mode: ValueMode): ValueModeDescriptor {
  assertValueMode(mode);
  return VALUE_MODE_DESCRIPTORS[mode];
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric input: ${value}`);
  }
  return Math.min(1, Math.max(0, value));
}

export function quantizeValue(raw: number, mode: ValueMode): number {
  const value = clamp01(raw);
  const descriptor = getValueModeDescriptor(mode);

  if (descriptor.stepCount === 1) {
    return value;
  }

  const span = descriptor.maxValue - descriptor.minValue;
  const normalized = clamp01((value - descriptor.minValue) / span);
  const scale = descriptor.stepCount - 1;
  const quantized = Math.round(normalized * scale) / scale;

  return descriptor.minValue + quantized * span;
}

export function isContinuous(mode: ValueMode): boolean {
  return getValueModeDescriptor(mode).stepCount === 1;
}
