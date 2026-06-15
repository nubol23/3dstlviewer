import chroma from "chroma-js";

import type { ValueRampState } from "../types";

export const DEFAULT_VALUE_RAMP: ValueRampState = {
  shadowLightness: 18,
  highlightLightness: 88,
  bandBias: 0,
};

export const VALUE_RAMP_MIN_CONTRAST = 20;

type RampStepCount = 3 | 5;

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  return value;
}

function assertNumberRange(value: unknown, label: string, min: number, max: number): number {
  const numberValue = assertFiniteNumber(value, label);
  if (numberValue < min || numberValue > max) {
    throw new Error(`Invalid ${label}: ${numberValue} is outside ${min}..${max}`);
  }
  return numberValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertRampStepCount(stepCount: unknown): RampStepCount {
  if (stepCount !== 3 && stepCount !== 5) {
    throw new Error(`Unsupported value ramp step count: ${String(stepCount)}`);
  }
  return stepCount;
}

export function assertValueRampState(value: unknown): ValueRampState {
  if (!isRecord(value)) {
    throw new Error("Invalid value ramp state: expected object");
  }

  const shadowInput = assertFiniteNumber(value.shadowLightness, "value ramp shadow lightness");
  const highlightInput = assertFiniteNumber(value.highlightLightness, "value ramp highlight lightness");

  if (highlightInput - shadowInput < VALUE_RAMP_MIN_CONTRAST) {
    throw new Error(
      `Invalid value ramp contrast: highlight and shadow values must differ by at least ${VALUE_RAMP_MIN_CONTRAST}`,
    );
  }

  const shadowLightness = assertNumberRange(shadowInput, "value ramp shadow lightness", 5, 40);
  const highlightLightness = assertNumberRange(highlightInput, "value ramp highlight lightness", 60, 98);
  const bandBias = assertNumberRange(value.bandBias, "value ramp band bias", -0.25, 0.25);

  return {
    shadowLightness,
    highlightLightness,
    bandBias,
  };
}

export function createValueRampColors(valueRamp: ValueRampState, stepCount: RampStepCount): string[] {
  const ramp = assertValueRampState(valueRamp);
  const steps = assertRampStepCount(stepCount);
  const colors = chroma
    .scale([
      chroma.lch(ramp.shadowLightness, 0, 0),
      chroma.lch(ramp.highlightLightness, 0, 0),
    ])
    .mode("lch")
    .colors(steps);

  return colors.map((color) => chroma(color).hex());
}
