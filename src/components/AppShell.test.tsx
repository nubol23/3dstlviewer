// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

  it("uses one live alert for load errors", () => {
    renderShell({ error: "Load failed. Previous model remains loaded." });

    expect(screen.getByRole("alert")).toHaveTextContent("Load failed. Previous model remains loaded.");
  });

  it("renders mobile sheet tabs with selected tab state", () => {
    renderShell({ activeTab: "model" });

    expect(screen.getByRole("tablist", { name: "Mobile controls" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Model" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Model");
  });
});
