import { z } from "zod";

import type { ValueMode } from "../types";

export type ValueModeDescriptor = {
  mode: ValueMode;
  stepCount: 1 | 3 | 5;
};

export const VALUE_MODE_DESCRIPTORS: Record<ValueMode, ValueModeDescriptor> = {
  shaded: {
    mode: "shaded",
    stepCount: 1,
  },
  "three-step": {
    mode: "three-step",
    stepCount: 3,
  },
  "five-step": {
    mode: "five-step",
    stepCount: 5,
  },
};

const VALUE_MODE_SCHEMA = z.enum(["shaded", "three-step", "five-step"], {
  error: (issue) => `Unsupported value mode: ${String(issue.input)}`,
});

function parseSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid value mode");
  }

  return result.data;
}

export function assertValueMode(mode: unknown): asserts mode is ValueMode {
  parseSchema(VALUE_MODE_SCHEMA, mode);
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

  if (value === 1) {
    return 1;
  }

  const band = Math.min(
    descriptor.stepCount - 1,
    Math.max(0, Math.floor(value * descriptor.stepCount)),
  );

  return band / (descriptor.stepCount - 1);
}

export function isContinuous(mode: ValueMode): boolean {
  return getValueModeDescriptor(mode).stepCount === 1;
}
