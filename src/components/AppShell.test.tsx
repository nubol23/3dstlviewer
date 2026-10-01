// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../state";
import type { AppState } from "../types";
import { AppShell } from "./AppShell";

function renderShell(statePatch: Partial<AppState> = {}) {
  const state: AppState = {
    ...createInitialState(),
    ...statePatch,
  };

  return render(
    <AppShell
      state={state}
      dispatch={vi.fn()}
      onFileSelected={vi.fn()}
      onFitToView={vi.fn()}
      onResetView={vi.fn()}
      onRotateModel={vi.fn()}
      onResetModelOrientation={vi.fn()}
    >
      <div data-testid="viewer" />
    </AppShell>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("AppShell accessibility", () => {
  it("exposes desktop and mobile file inputs with an Open STL label", () => {
    renderShell();

    const fileInputs = screen
      .getAllByLabelText("Open STL")
      .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement);
    expect(fileInputs).toHaveLength(2);
    fileInputs.forEach((input) => {
      expect(input).toHaveAttribute("type", "file");
    });
  });

  it("does not render the removed custom load feedback surface", () => {
    renderShell({ isLoading: true });

    expect(screen.queryByTestId("global-load-feedback")).not.toBeInTheDocument();
    expect(screen.queryByTestId("load-error")).not.toBeInTheDocument();
  });

  it("renders mobile sheet tabs with selected tab state", () => {
    renderShell({ activeTab: "model" });

    expect(screen.getByRole("tablist", { name: "Mobile controls" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Model" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Model");
  });

  it("toggles mobile viewer maximize mode without changing app state", () => {
    const { container } = renderShell({ activeTab: "model" });

    const maximizeButton = screen.getByRole("button", { name: "Maximize Viewer" });
    const appShell = container.querySelector(".app-shell");
    const mobileSheet = container.querySelector(".mobile-sheet");

    expect(maximizeButton).toHaveAttribute("aria-pressed", "false");
    expect(appShell).not.toHaveClass("is-viewer-maximized");
    expect(mobileSheet).not.toHaveAttribute("hidden");

    fireEvent.click(maximizeButton);

    expect(maximizeButton).toHaveAttribute("aria-pressed", "true");
    expect(appShell).toHaveClass("is-viewer-maximized");
    expect(mobileSheet).toHaveAttribute("hidden");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(maximizeButton).toHaveAttribute("aria-pressed", "false");
    expect(appShell).not.toHaveClass("is-viewer-maximized");
    expect(mobileSheet).not.toHaveAttribute("hidden");
  });

  it("keeps mobile value controls in the lower View tab instead of the viewport", () => {
    const { container } = renderShell({ activeTab: "view" });

    expect(container.querySelector(".mobile-mode-segmented")).not.toBeInTheDocument();
    const mobileValueStudy = screen.getByTestId("mobile-value-study-control");
    expect(within(mobileValueStudy).getByRole("radio", { name: "Smooth" })).toBeChecked();
    expect(within(mobileValueStudy).getByRole("radio", { name: "Stepped" })).toBeInTheDocument();
    expect(within(mobileValueStudy).getByRole("combobox", { name: "Values" })).toBeDisabled();
  });

  it("exposes desktop and mobile value ramp controls", () => {
    renderShell({ activeTab: "view" });

    expect(screen.getByTestId("desktop-value-ramp-control")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-value-ramp-control")).toBeInTheDocument();
    expect(screen.getAllByRole("slider", { name: /Shadow Value/ })).toHaveLength(2);
    expect(screen.getAllByRole("slider", { name: /Highlight Value/ })).toHaveLength(2);
    expect(screen.getAllByRole("slider", { name: /Band Bias/ })).toHaveLength(2);
  });

  it("exposes broad zenithal controls and disables unused direction inputs", () => {
    renderShell({ activeTab: "light", lightingMode: "broad-zenithal" });

    screen.getAllByRole("combobox", { name: "Lighting model" }).forEach((radio) => {
      expect(radio).toHaveValue("broad-zenithal");
    });
    screen.getAllByRole("button", { name: "Light direction pad" }).forEach((button) => {
      expect(button).toBeDisabled();
    });
    screen.getAllByRole("slider", { name: /Azimuth/ }).forEach((slider) => {
      expect(slider).toBeDisabled();
    });
    screen.getAllByRole("slider", { name: /Elevation/ }).forEach((slider) => {
      expect(slider).toBeDisabled();
    });
    expect(screen.getAllByRole("combobox", { name: "Apply Lighting Setup" })).toHaveLength(2);
  });

  it("shows every supported stepped value count and a matching preview", () => {
    renderShell({ activeTab: "view", renderStyle: "stepped", valueStepCount: 8 });

    const countControls = screen.getAllByRole("combobox", { name: "Values" });
    expect(countControls).toHaveLength(2);
    countControls.forEach((control) => {
      expect(control).toHaveValue("8");
      expect(within(control).getAllByRole("option")).toHaveLength(6);
    });
    expect(screen.getByTestId("desktop-value-ramp-preview").children).toHaveLength(8);
    expect(screen.getByTestId("mobile-value-ramp-preview").children).toHaveLength(8);
  });

  it("shows a continuous ramp preview in smooth mode", () => {
    renderShell({ activeTab: "view", renderStyle: "smooth" });

    const previews = [
      screen.getByTestId("desktop-value-ramp-preview"),
      screen.getByTestId("mobile-value-ramp-preview"),
    ];
    previews.forEach((preview) => {
      expect(preview).toHaveClass("is-smooth");
      expect(preview.style.getPropertyValue("--value-ramp-gradient")).toMatch(
        /^linear-gradient\(90deg, .+\)$/,
      );
      expect(preview.children).toHaveLength(0);
    });
  });

  it("disables lighting mode changes while the light is locked", () => {
    renderShell({ activeTab: "light", light: { ...createInitialState().light, locked: true } });

    screen.getAllByRole("combobox", { name: "Lighting model" }).forEach((radio) => {
      expect(radio).toBeDisabled();
    });
  });
});
