// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RangeControl, SegmentedControl } from "./Controls";
import { domePointToLightDirection, projectLightToDomePoint, SunDomeControl } from "./SunDomeControl";
import { DEFAULT_LIGHT } from "../state";

const valueOptions = [
  { value: "smooth", label: "Smooth" },
  { value: "stepped", label: "Stepped" },
] as const;

describe("Controls accessibility", () => {
  it("renders value mode as a named radio group", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={valueOptions}
        value="stepped"
        onChange={onChange}
        name="test-value-mode"
        ariaLabel="Value rendering"
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Value rendering" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Stepped" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Smooth" }));
    expect(onChange).toHaveBeenCalledWith("smooth");
  });

  it("computes range fill from min, max, and value", () => {
    render(
      <RangeControl
        label="Intensity"
        min={0}
        max={10}
        step={1}
        value={7.5}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("slider", { name: /Intensity/ })).toHaveStyle("--range-fill: 75%");
  });

  it("updates light direction from sun dome arrow keys", () => {
    const onChange = vi.fn();
    render(<SunDomeControl light={DEFAULT_LIGHT} onChange={onChange} />);

    const pad = screen.getByRole("button", { name: "Light direction pad" });
    fireEvent.keyDown(pad, { key: "ArrowRight" });
    fireEvent.keyDown(pad, { key: "ArrowUp", shiftKey: true });

    expect(onChange).toHaveBeenNthCalledWith(1, { azimuthDeg: 320 });
    expect(onChange).toHaveBeenNthCalledWith(2, { elevationDeg: 65 });
  });

  it("uses a stable dome projection for pointer light direction", () => {
    const projected = projectLightToDomePoint({ azimuthDeg: 315, elevationDeg: 48 });
    const roundTrip = domePointToLightDirection(projected, 315);
    const nearZenith = domePointToLightDirection({ x: 0.01, y: 0.01 }, 315);
    const lowerElevation = domePointToLightDirection({ x: 0, y: -0.5 }, 315);

    expect(roundTrip.azimuthDeg).toBeCloseTo(315);
    expect(roundTrip.elevationDeg).toBeCloseTo(48);
    expect(nearZenith.azimuthDeg).toBe(315);
    expect(nearZenith.elevationDeg).toBeGreaterThan(89);
    expect(lowerElevation.azimuthDeg).toBeCloseTo(0);
    expect(lowerElevation.elevationDeg).toBeCloseTo(48);
  });
});
