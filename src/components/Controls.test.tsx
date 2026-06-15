// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RangeControl, SegmentedControl } from "./Controls";
import { SunDomeControl } from "./SunDomeControl";
import { DEFAULT_LIGHT } from "../state";

const valueOptions = [
  { value: "shaded", label: "Shaded" },
  { value: "three-step", label: "3-Step" },
  { value: "five-step", label: "5-Step" },
] as const;

describe("Controls accessibility", () => {
  it("renders value mode as a named radio group", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={valueOptions}
        value="three-step"
        onChange={onChange}
        name="test-value-mode"
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Value mode" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "3-Step" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "5-Step" }));
    expect(onChange).toHaveBeenCalledWith("five-step");
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
    expect(onChange).toHaveBeenNthCalledWith(2, { elevationDeg: 63 });
  });
});
