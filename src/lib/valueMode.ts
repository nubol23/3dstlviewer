import { z } from "zod";

import type { ValueRenderStyle, ValueStepCount } from "../types";

const VALUE_RENDER_STYLE_SCHEMA = z.enum(["smooth", "stepped"], {
  error: (issue) => `Unsupported value render style: ${String(issue.input)}`,
});

const VALUE_STEP_COUNT_SCHEMA = z.union(
  [
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
  ],
  {
    error: (issue) => `Unsupported value step count: ${String(issue.input)}`,
  },
);

function parseSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid value study setting");
  }

  return result.data;
}

export function assertValueRenderStyle(value: unknown): asserts value is ValueRenderStyle {
  parseSchema(VALUE_RENDER_STYLE_SCHEMA, value);
}

export function assertValueStepCount(value: unknown): asserts value is ValueStepCount {
  parseSchema(VALUE_STEP_COUNT_SCHEMA, value);
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric input: ${value}`);
  }
  return Math.min(1, Math.max(0, value));
}

export function quantizeValue(raw: number, renderStyle: ValueRenderStyle, stepCount: ValueStepCount): number {
  assertValueRenderStyle(renderStyle);
  assertValueStepCount(stepCount);
  const value = clamp01(raw);

  if (renderStyle === "smooth") {
    return value;
  }

  if (value === 1) {
    return 1;
  }

  const band = Math.min(stepCount - 1, Math.max(0, Math.floor(value * stepCount)));
  return band / (stepCount - 1);
}
