import chroma from "chroma-js";
import { z } from "zod";

import type { ValueRampState, ValueStepCount } from "../types";
import { assertValueStepCount } from "./valueMode";

// AgX places ordinary matte studies in the midtones. Keep the extreme values
// available while giving the default bands useful separation through that range.
export function defaultThresholds(count: ValueStepCount): number[] {
  return Array.from({ length: count - 1 }, (_, i) => 0.15 + (i + 1) * 0.7 / count);
}

export const DEFAULT_VALUE_RAMP: ValueRampState = {
  shadowLightness: 8,
  highlightLightness: 94,
  bandBias: 0,
  exposure: 1,
  smoothingRadius: 1,
  grayscale: true,
  thresholds: defaultThresholds(5),
};

export const VALUE_RAMP_MIN_CONTRAST = 20;

function parseSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid value ramp state");
  }

  return result.data;
}

function finiteNumberSchema(label: string): z.ZodNumber {
  return z.number({
    error: (issue) => `Invalid ${label}: ${String(issue.input)}`,
  });
}

function numberRangeSchema(label: string, min: number, max: number) {
  return finiteNumberSchema(label).superRefine((value, context) => {
    if (value < min || value > max) {
      context.addIssue({
        code: "custom",
        message: `Invalid ${label}: ${value} is outside ${min}..${max}`,
      });
    }
  });
}

const VALUE_RAMP_INPUT_SCHEMA = z
  .object(
    {
      shadowLightness: finiteNumberSchema("value ramp shadow lightness"),
      highlightLightness: finiteNumberSchema("value ramp highlight lightness"),
      bandBias: finiteNumberSchema("value ramp band bias"),
      exposure: numberRangeSchema("exposure", 0.1, 4),
      smoothingRadius: numberRangeSchema("smoothing radius", 0, 4),
      grayscale: z.boolean(),
      thresholds: z.array(z.number().min(0.01).max(0.99)).min(2).max(7).refine(values => values.every((v, i) => i === 0 || v > values[i - 1]), "Band thresholds must be increasing"),
    },
    { error: "Invalid value ramp state: expected object" },
  )
  .superRefine((value, context) => {
    if (value.highlightLightness - value.shadowLightness < VALUE_RAMP_MIN_CONTRAST) {
      context.addIssue({
        code: "custom",
        message: `Invalid value ramp contrast: highlight and shadow values must differ by at least ${VALUE_RAMP_MIN_CONTRAST}`,
      });
    }
  });

const VALUE_RAMP_STATE_SCHEMA: z.ZodType<ValueRampState> = VALUE_RAMP_INPUT_SCHEMA.pipe(
  z.object({
    shadowLightness: numberRangeSchema("value ramp shadow lightness", 5, 40),
    highlightLightness: numberRangeSchema("value ramp highlight lightness", 60, 98),
    bandBias: numberRangeSchema("value ramp band bias", -0.25, 0.25),
    exposure: z.number(), smoothingRadius: z.number(), thresholds: z.array(z.number()), grayscale: z.boolean(),
  }),
);

export function assertValueRampState(value: unknown): ValueRampState {
  return parseSchema(VALUE_RAMP_STATE_SCHEMA, value);
}

export function createValueRampColors(valueRamp: ValueRampState, stepCount: number): string[] {
  const ramp = assertValueRampState(valueRamp);
  assertValueStepCount(stepCount);
  const colors = chroma
    .scale([
      chroma.lch(ramp.shadowLightness, 0, 0),
      chroma.lch(ramp.highlightLightness, 0, 0),
    ])
    .mode("lch")
    .colors(stepCount);

  return colors.map((color) => chroma(color).hex());
}
