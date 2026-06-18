// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("keeps mobile value mode in the lower View tab instead of the viewport", () => {
    const { container } = renderShell({ activeTab: "view" });

    expect(container.querySelector(".mobile-mode-segmented")).not.toBeInTheDocument();
    const mobileValueMode = screen.getByTestId("mobile-value-mode-control");
    expect(within(mobileValueMode).getByRole("radio", { name: "Shaded" })).toBeChecked();
    expect(within(mobileValueMode).getByRole("radio", { name: "3-Step" })).toBeInTheDocument();
    expect(within(mobileValueMode).getByRole("radio", { name: "5-Step" })).toBeInTheDocument();
  });

  it("exposes desktop and mobile value ramp controls", () => {
    renderShell({ activeTab: "view" });

    expect(screen.getByTestId("desktop-value-ramp-control")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-value-ramp-control")).toBeInTheDocument();
    expect(screen.getAllByRole("slider", { name: /Shadow Value/ })).toHaveLength(2);
    expect(screen.getAllByRole("slider", { name: /Highlight Value/ })).toHaveLength(2);
    expect(screen.getAllByRole("slider", { name: /Band Bias/ })).toHaveLength(2);
  });

  it("exposes zenithal study controls and disables unused direction inputs when enabled", () => {
    renderShell({ activeTab: "light", zenithalStudy: true });

    expect(screen.getByTestId("desktop-zenithal-study-checkbox")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("mobile-zenithal-study-checkbox")).toHaveAttribute("aria-checked", "true");
    screen.getAllByRole("button", { name: "Light direction pad" }).forEach((button) => {
      expect(button).toBeDisabled();
    });
    screen.getAllByRole("slider", { name: /Azimuth/ }).forEach((slider) => {
      expect(slider).toBeDisabled();
    });
    screen.getAllByRole("slider", { name: /Elevation/ }).forEach((slider) => {
      expect(slider).toBeDisabled();
    });
  });
});
