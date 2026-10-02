import type { FloorState, LightState } from "../types";

export const KEY_COLORS = {
  white: "#ffffff",
  warm: "#ffe2b3",
} as const;

export type KeyColorPreset = keyof typeof KEY_COLORS;

type FillColors = Pick<LightState, "secondaryColor" | "environmentColor"> & { floorColor: FloorState["color"] };

export const FILL_PALETTES = {
  neutral: { secondaryColor: "#ffffff", environmentColor: "#ffffff", floorColor: "#888888" },
  cool: { secondaryColor: "#a8c7ef", environmentColor: "#b6c9e3", floorColor: "#78899f" },
} as const satisfies Record<string, FillColors>;

export type FillPalette = keyof typeof FILL_PALETTES;

export function keyColorPreset(keyColor: string): KeyColorPreset | null {
  const color = keyColor.toLowerCase();
  return (Object.keys(KEY_COLORS) as KeyColorPreset[]).find((preset) => KEY_COLORS[preset] === color) ?? null;
}

export function fillPalettePreset(light: Pick<LightState, "secondaryColor" | "environmentColor">, floor: Pick<FloorState, "color">): FillPalette | null {
  return (Object.keys(FILL_PALETTES) as FillPalette[]).find((palette) => {
    const colors = FILL_PALETTES[palette];
    return colors.secondaryColor === light.secondaryColor.toLowerCase()
      && colors.environmentColor === light.environmentColor.toLowerCase()
      && colors.floorColor === floor.color.toLowerCase();
  }) ?? null;
}
