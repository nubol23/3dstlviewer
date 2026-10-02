// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../state";
import { defaultThresholds } from "../lib/valueRamp";
import type { AppAction, AppState } from "../types";
import { AppShell } from "./AppShell";

function mockLayout(sheet: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: sheet,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function renderShell(statePatch: Partial<AppState> = {}) {
  const state: AppState = { ...createInitialState(), ...statePatch };
  const dispatch = vi.fn<(action: AppAction) => void>();
  const onFileSelected = vi.fn<(file: File) => void>();
  const view = render(
    <AppShell
      state={state}
      dispatch={dispatch}
      onFileSelected={onFileSelected}
      onFitToView={vi.fn()}
      onResetView={vi.fn()}
      onRotateModel={vi.fn()}
      onResetModelOrientation={vi.fn()}
    >
      <div data-testid="viewer" />
    </AppShell>,
  );
  return { ...view, dispatch, onFileSelected };
}

function dropFiles(target: Element, files: File[]) {
  const dataTransfer = { types: ["Files"], files, dropEffect: "none" };
  const drop = createEvent.drop(target);
  Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
  fireEvent(target, drop);
}

beforeEach(() => {
  localStorage.clear();
  mockLayout(false);
});

afterEach(() => {
  cleanup();
});

describe("AppShell", () => {
  it("opens a chosen STL through a single file input", () => {
    const { onFileSelected } = renderShell();

    expect(screen.getByRole("button", { name: "Open STL" })).toBeInTheDocument();
    const file = new File(["solid"], "mini.stl");
    fireEvent.change(screen.getByTestId("stl-file-input"), { target: { files: [file] } });

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it("invites the user to open a model while the viewer is empty", () => {
    renderShell();

    expect(screen.getByRole("heading", { name: "Open an STL to study its values" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose STL file" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Camera" })).not.toBeInTheDocument();
  });

  it("opens dropped STL files and rejects other file types", () => {
    const { container, onFileSelected } = renderShell();
    const shell = container.querySelector(".app-shell")!;

    dropFiles(shell, [new File(["x"], "notes.txt")]);
    expect(onFileSelected).not.toHaveBeenCalled();

    const stl = new File(["solid"], "Bust.STL");
    dropFiles(shell, [stl]);
    expect(onFileSelected).toHaveBeenCalledWith(stl);
  });

  it("groups controls into four inspector tabs", () => {
    renderShell({ activeTab: "scene" });

    const tabs = within(screen.getByRole("tablist", { name: "Controls" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Light", "Values", "Scene", "Presets"]);
    expect(screen.getByRole("tab", { name: "Scene" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Scene");
  });

  it("hides and shows the desktop inspector", () => {
    const { container } = renderShell();
    const inspector = container.querySelector("#inspector");

    fireEvent.click(screen.getByRole("button", { name: "Hide controls" }));
    expect(inspector).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Show controls" }));
    expect(inspector).toBeVisible();
  });

  it("opens the mobile sheet from a tab and collapses it from the active tab or Escape", () => {
    mockLayout(true);
    const { container } = renderShell({ activeTab: "light" });
    const body = container.querySelector("#inspector-body");
    const lightTab = screen.getByRole("tab", { name: "Light" });

    expect(body).not.toBeVisible();
    fireEvent.mouseDown(lightTab);
    fireEvent.click(lightTab);
    expect(body).toBeVisible();

    fireEvent.mouseDown(lightTab);
    fireEvent.click(lightTab);
    expect(body).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Show controls" }));
    expect(body).toBeVisible();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(body).not.toBeVisible();
  });
});

describe("Value study bar", () => {
  it("switches from smooth to a band count in one choice", () => {
    const { dispatch } = renderShell({ renderStyle: "smooth", valueStepCount: 5 });
    const study = screen.getByRole("radiogroup", { name: "Value study" });

    expect(within(study).getByRole("radio", { name: "Smooth" })).toBeChecked();
    expect(within(study).getAllByRole("radio")).toHaveLength(7);
    fireEvent.click(within(study).getByRole("radio", { name: "3 values" }));

    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: "set-render-style", renderStyle: "stepped" },
      { type: "set-value-step-count", valueStepCount: 3 },
    ]);
  });

  it("keeps custom thresholds when returning to the current band count", () => {
    const { dispatch } = renderShell({ renderStyle: "smooth", valueStepCount: 5 });

    fireEvent.click(screen.getByRole("radio", { name: "5 values" }));

    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([{ type: "set-render-style", renderStyle: "stepped" }]);
  });

  it("previews the stepped bands and the smooth ramp", () => {
    renderShell({ renderStyle: "stepped", valueStepCount: 8 });
    expect(screen.getByRole("radio", { name: "8 values" })).toBeChecked();
    expect(screen.getByTestId("value-ramp-preview").children).toHaveLength(8);
    cleanup();

    renderShell({ renderStyle: "smooth" });
    const preview = screen.getByTestId("value-ramp-preview");
    expect(preview.children).toHaveLength(0);
    expect(preview.style.getPropertyValue("--ramp-gradient")).toMatch(/^linear-gradient\(90deg, .+\)$/);
  });
});

describe("Light panel", () => {
  it("applies a lighting setup from the setup cards", () => {
    const { dispatch } = renderShell({ activeTab: "light" });

    expect(screen.getByRole("radio", { name: "Directional" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Double Directional" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "apply-light-setup", setupId: "dual" });
  });

  it("restores the current setup's defaults from Reset setup", () => {
    const { dispatch } = renderShell({ activeTab: "light", lightingMode: "local" });

    fireEvent.click(screen.getByRole("button", { name: "Reset setup" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "apply-light-setup", setupId: "local" });
  });

  it("disables direction inputs for zenithal setups", () => {
    renderShell({ activeTab: "light", lightingMode: "broad-zenithal" });

    expect(screen.getByRole("radio", { name: "Broad Zenithal" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Light direction pad" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Azimuth" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Elevation" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Zenithal Spread" })).toBeEnabled();
  });

  it("shows second-light controls only for double directional", () => {
    renderShell({ activeTab: "light", lightingMode: "dual", light: { ...createInitialState().light, secondaryOpposite: true } });

    expect(screen.getByRole("switch", { name: "Keep Second Light Opposite" })).toBeChecked();
    expect(screen.getByRole("slider", { name: "Second Azimuth" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Second Elevation" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cool Blue Fill" })).toBeEnabled();
    cleanup();

    renderShell({ activeTab: "light", lightingMode: "directional" });
    expect(screen.queryByRole("switch", { name: "Keep Second Light Opposite" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cool Blue Fill" })).not.toBeInTheDocument();
  });

  it("turns on color presentation when the warm key is selected", () => {
    const { dispatch } = renderShell({ activeTab: "light" });

    fireEvent.click(screen.getByRole("switch", { name: "Warm Key Light" }));

    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
      { type: "set-light", patch: { keyColor: "#ffe2b3" } },
      { type: "set-value-ramp", patch: { grayscale: false } },
    ]);
  });

  it("locks setup and direction edits while the light is locked", () => {
    renderShell({ activeTab: "light", light: { ...createInitialState().light, locked: true } });

    expect(screen.getByRole("button", { name: "Lock light" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Light is locked/)).toBeInTheDocument();
    screen.getAllByRole("radio").filter((radio) => radio.closest("[aria-label='Lighting setup']")).forEach((radio) => {
      expect(radio).toBeDisabled();
    });
    expect(screen.getByRole("slider", { name: "Intensity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset setup" })).toBeDisabled();
  });
});

describe("Values and presets panels", () => {
  it("shows band thresholds only for stepped studies", () => {
    renderShell({ activeTab: "values", renderStyle: "smooth" });
    expect(screen.getByRole("slider", { name: "Contrast" })).toBeInTheDocument();
    expect(screen.queryByText("Band thresholds")).not.toBeInTheDocument();
    cleanup();

    const valueRamp = { ...createInitialState().valueRamp, thresholds: defaultThresholds(4) };
    renderShell({ activeTab: "values", renderStyle: "stepped", valueStepCount: 4, valueRamp });
    fireEvent.click(screen.getByText("Band thresholds"));
    expect(screen.getAllByRole("slider", { name: /^Boundary/ })).toHaveLength(3);
  });

  it("explains empty presets and saves the current look", () => {
    const { dispatch } = renderShell({ activeTab: "presets" });

    expect(screen.getByText("No saved looks yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save current look" }));

    expect(dispatch).toHaveBeenCalledWith({ type: "save-preset" });
  });
});
