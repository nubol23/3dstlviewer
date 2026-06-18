import chroma from "chroma-js";
import { z } from "zod";

import type { ValueRampState } from "../types";

export const DEFAULT_VALUE_RAMP: ValueRampState = {
  shadowLightness: 18,
  highlightLightness: 88,
  bandBias: 0,
};

export const VALUE_RAMP_MIN_CONTRAST = 20;

type RampStepCount = 3 | 5;

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
  }),
);

const RAMP_STEP_COUNT_SCHEMA = z.literal([3, 5], {
  error: (issue) => `Unsupported value ramp step count: ${String(issue.input)}`,
});

export function assertValueRampState(value: unknown): ValueRampState {
  return parseSchema(VALUE_RAMP_STATE_SCHEMA, value);
}

export function createValueRampColors(valueRamp: ValueRampState, stepCount: RampStepCount): string[] {
  const ramp = assertValueRampState(valueRamp);
  const steps = parseSchema(RAMP_STEP_COUNT_SCHEMA, stepCount);
  const colors = chroma
    .scale([
      chroma.lch(ramp.shadowLightness, 0, 0),
      chroma.lch(ramp.highlightLightness, 0, 0),
    ])
    .mode("lch")
    .colors(steps);

  return colors.map((color) => chroma(color).hex());
}
