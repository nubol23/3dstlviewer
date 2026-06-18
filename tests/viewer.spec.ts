import { fileURLToPath } from "node:url";
import { test as base, expect, type Locator, type Page } from "@playwright/test";

const test = base.extend<{ assertNoConsoleErrors: void }>({
  assertNoConsoleErrors: [
    async ({ page }, use) => {
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors.push(`console error: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        consoleErrors.push(`page error: ${error.message}`);
      });

      await use();

      expect(consoleErrors).toEqual([]);
    },
    { auto: true },
  ],
});

const zUpMiniPath = fileURLToPath(new URL("./fixtures/z-up-mini.stl", import.meta.url));
const degenerateMiniPath = fileURLToPath(new URL("./fixtures/degenerate-mini.stl", import.meta.url));
const valueBandIslandPath = fileURLToPath(new URL("./fixtures/value-band-island.stl", import.meta.url));

async function expectCanvasToRender(page: Page): Promise<void> {
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect
    .poll(
      async () => canvas.evaluate((element) => element.toDataURL("image/png").length),
      { message: "canvas should render non-empty model content", timeout: 5_000 },
    )
    .toBeGreaterThan(1_000);
}

async function expectDesktopWorkbenchLayout(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const viewport = document.querySelector(".viewport")?.getBoundingClientRect();
    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      viewport: viewport
        ? {
            bottom: viewport.bottom,
            height: viewport.height,
            left: viewport.left,
            right: viewport.right,
            top: viewport.top,
            width: viewport.width,
          }
        : null,
      windowWidth: window.innerWidth,
    };
  });

  expect(layout.horizontalOverflow).toBe(false);
  expect(layout.viewport).not.toBeNull();
  expect(layout.viewport!.width).toBeGreaterThan(240);
  expect(layout.viewport!.height).toBeGreaterThan(180);
  expect(layout.viewport!.left).toBeGreaterThanOrEqual(0);
  expect(layout.viewport!.top).toBeGreaterThanOrEqual(0);
  expect(layout.viewport!.right).toBeLessThanOrEqual(layout.windowWidth + 1);
  expect(layout.viewport!.bottom).toBeGreaterThan(layout.viewport!.top);
}

async function selectValueMode(valueModeControl: Locator, label: "Shaded" | "3-Step" | "5-Step"): Promise<void> {
  await valueModeControl.locator("label").filter({ hasText: label }).click();
  await expect(valueModeControl.getByRole("radio", { name: label })).toBeChecked();
}

test.describe("STL viewer", () => {
  test("loads and manipulates a z-up STL with the default import orientation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Miniature Light Studio")).toBeVisible();
    await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
    await expect(page.getByRole("heading", { name: "z-up-mini.stl" }).first()).toBeVisible();
    const loadedToast = page.getByText("Loaded z-up-mini.stl.");
    await expect(loadedToast).toBeVisible();
    await expect(page.getByText("1. X -90°")).toBeVisible();
    await expect(page.getByTestId("global-load-feedback")).toHaveCount(0);
    await expect(loadedToast).toBeHidden({ timeout: 6000 });

    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);

    await page.getByTestId("rotate-y-positive").click();
    await expect(page.getByText("1. X -90°")).toBeVisible();
    await expect(page.getByText("2. Y +90°")).toBeVisible();

    await page.getByTestId("reset-model-orientation-button").click();
    await expect(page.getByText("1. X -90°")).toBeVisible();

    const desktopValueMode = page.getByTestId("value-mode-control");
    await selectValueMode(desktopValueMode, "3-Step");
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);
    await page.getByRole("slider", { name: "Shadow Value" }).fill("30");
    await expect(page.getByRole("slider", { name: "Shadow Value" })).toHaveValue("30");

    await page.getByTestId("desktop-zenithal-study-checkbox").click();
    await expect(page.getByTestId("desktop-zenithal-study-checkbox")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("light-azimuth-slider").first()).toBeDisabled();
    await expect(page.getByTestId("light-elevation-slider").first()).toBeDisabled();
    await page.getByTestId("desktop-zenithal-study-checkbox").click();
    await expect(page.getByTestId("light-azimuth-slider").first()).toBeEnabled();

    await selectValueMode(desktopValueMode, "5-Step");
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);
    await selectValueMode(desktopValueMode, "Shaded");
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);

    const shadowSoftness = page.getByRole("slider", { name: "Shadow Softness" }).first();
    await shadowSoftness.fill("1");
    await shadowSoftness.fill("0");

    await page.getByTestId("stl-file-input").setInputFiles({
      name: "invalid.stl",
      mimeType: "model/stl",
      buffer: Buffer.from([0]),
    });
    const errorToast = page.getByText(/Invalid STL content for invalid\.stl/);
    await expect(errorToast).toBeVisible();
    await expect(page.getByRole("heading", { name: "z-up-mini.stl" }).first()).toBeVisible();
    await expect(page.getByTestId("global-load-feedback")).toHaveCount(0);
    await expect(errorToast).toBeHidden({ timeout: 8000 });
  });

  test("validates quantized modes on a synthetic tiny band island after default orientation", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("stl-file-input").setInputFiles(valueBandIslandPath);

    await expect(page.getByRole("heading", { name: "value-band-island.stl" }).first()).toBeVisible();
    await expect(page.getByText("Loaded value-band-island.stl.")).toBeVisible();
    await expect(page.getByText("4 tris").first()).toBeVisible();
    await expect(page.getByText("1. X -90°")).toBeVisible();
    await expect(page.getByTestId("global-load-feedback")).toHaveCount(0);
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);

    const desktopValueMode = page.getByTestId("value-mode-control");
    await selectValueMode(desktopValueMode, "3-Step");
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);
    await selectValueMode(desktopValueMode, "5-Step");
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);
    await selectValueMode(desktopValueMode, "Shaded");
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);
  });

  test("keeps mobile controls usable at 320x568", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
    await page.getByRole("tab", { name: "Model" }).click();
    await expect(page.getByRole("heading", { name: "z-up-mini.stl" }).first()).toBeVisible();
    await expect(page.locator(".mobile-sheet").getByText("1. X -90°")).toBeVisible();
    await page.locator(".mobile-sheet").getByTestId("rotate-y-positive").click();
    await expect(page.locator(".mobile-sheet").getByText("2. Y +90°")).toBeVisible();
    await page.locator(".mobile-sheet").getByTestId("reset-model-orientation-button").click();
    await expect(page.locator(".mobile-sheet").getByText("1. X -90°")).toBeVisible();
    await page.getByTestId("mobile-stl-file-input").setInputFiles(zUpMiniPath);
    await expect(page.locator(".mobile-sheet").getByText("1. X -90°")).toBeVisible();
    await expect(page.getByTestId("global-load-feedback")).toHaveCount(0);

    const boxes = await page.evaluate(() => {
      const viewport = document.querySelector(".viewport")?.getBoundingClientRect();
      const sheet = document.querySelector(".mobile-sheet")?.getBoundingClientRect();
      const modeOverlay = document.querySelector(".mobile-mode-segmented");
      const sunCue = document.querySelector(".sun-cue");
      return {
        viewport: viewport ? { top: viewport.top, bottom: viewport.bottom, height: viewport.height } : null,
        sheet: sheet ? { top: sheet.top, bottom: sheet.bottom, height: sheet.height } : null,
        hasModeOverlay: Boolean(modeOverlay),
        hasSunCue: Boolean(sunCue),
      };
    });

    expect(boxes.viewport).not.toBeNull();
    expect(boxes.sheet).not.toBeNull();
    expect(boxes.viewport!.height).toBeGreaterThan(100);
    expect(boxes.sheet!.top).toBeGreaterThanOrEqual(boxes.viewport!.bottom - 1);
    expect(boxes.sheet!.bottom).toBeLessThanOrEqual(568);
    expect(boxes.hasModeOverlay).toBe(false);
    expect(boxes.hasSunCue).toBe(false);

    const maximizeButton = page.getByTestId("maximize-viewer-button");
    await maximizeButton.click();
    await expect(maximizeButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".mobile-sheet")).toBeHidden();
    const maximizedBoxes = await page.evaluate(() => {
      const viewport = document.querySelector(".viewport")?.getBoundingClientRect();
      const sheet = document.querySelector(".mobile-sheet")?.getBoundingClientRect();
      return {
        viewport: viewport ? { top: viewport.top, bottom: viewport.bottom, height: viewport.height } : null,
        sheet: sheet ? { height: sheet.height } : null,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(maximizedBoxes.viewport).not.toBeNull();
    expect(maximizedBoxes.viewport!.height).toBeGreaterThan(boxes.viewport!.height + 100);
    expect(maximizedBoxes.viewport!.bottom).toBeLessThanOrEqual(568);
    expect(maximizedBoxes.sheet!.height).toBe(0);
    expect(maximizedBoxes.horizontalOverflow).toBe(false);
    await page.keyboard.press("Escape");
    await expect(maximizeButton).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".mobile-sheet")).toBeVisible();

    await page.getByRole("tab", { name: "Light" }).click();
    await page.getByTestId("mobile-zenithal-study-checkbox").click();
    await expect(page.getByTestId("mobile-zenithal-study-checkbox")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".mobile-sheet").getByTestId("light-azimuth-slider")).toBeDisabled();
    await expect(page.locator(".mobile-sheet").getByTestId("light-elevation-slider")).toBeDisabled();
    const lightLayout = await page.evaluate(() => {
      const sheetBody = document.querySelector(".mobile-sheet__body")?.getBoundingClientRect();
      const primary = document.querySelector(".mobile-sheet .sun-dome-panel__primary")?.getBoundingClientRect();
      const dome = document.querySelector(".mobile-sheet .sun-dome")?.getBoundingClientRect();
      const azimuth = document.querySelector("[data-testid='light-azimuth-slider']")?.getBoundingClientRect();
      const elevation = document.querySelector("[data-testid='light-elevation-slider']")?.getBoundingClientRect();
      return {
        sheetBody: sheetBody ? { top: sheetBody.top, bottom: sheetBody.bottom, width: sheetBody.width, height: sheetBody.height } : null,
        primary: primary ? { top: primary.top, bottom: primary.bottom, left: primary.left, right: primary.right, width: primary.width, height: primary.height } : null,
        dome: dome ? { width: dome.width, height: dome.height, bottom: dome.bottom } : null,
        azimuth: azimuth ? { width: azimuth.width, height: azimuth.height } : null,
        elevation: elevation ? { width: elevation.width, height: elevation.height } : null,
      };
    });

    expect(lightLayout.sheetBody).not.toBeNull();
    expect(lightLayout.primary).not.toBeNull();
    expect(lightLayout.dome).not.toBeNull();
    expect(lightLayout.azimuth).not.toBeNull();
    expect(lightLayout.elevation).not.toBeNull();
    expect(lightLayout.dome!.width).toBeLessThanOrEqual(150);
    expect(lightLayout.dome!.height).toBeLessThanOrEqual(150);
    expect(lightLayout.primary!.width).toBeLessThanOrEqual(lightLayout.sheetBody!.width);
    expect(lightLayout.primary!.height).toBeLessThanOrEqual(lightLayout.sheetBody!.height);
    expect(lightLayout.primary!.top).toBeGreaterThanOrEqual(lightLayout.sheetBody!.top);
    expect(lightLayout.primary!.bottom).toBeLessThanOrEqual(lightLayout.sheetBody!.bottom);

    await page.getByRole("tab", { name: "View" }).click();
    await expect(page.getByTestId("mobile-value-mode-control")).toBeVisible();
    const mobileValueMode = page.getByTestId("mobile-value-mode-control");
    await selectValueMode(mobileValueMode, "3-Step");
    await expectCanvasToRender(page);
    await expect(page.getByTestId("mobile-value-ramp-control")).toBeVisible();
    await page.getByTestId("mobile-shadow-value-slider").fill("26");
    await expect(page.getByTestId("mobile-shadow-value-slider")).toHaveValue("26");
    await selectValueMode(mobileValueMode, "5-Step");
    await expectCanvasToRender(page);
    await selectValueMode(mobileValueMode, "Shaded");
    await expectCanvasToRender(page);

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(horizontalOverflow).toBe(false);
  });

  test("keeps compact mobile light layout at 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("tab", { name: "Light" }).click();
    await page.getByTestId("mobile-zenithal-study-checkbox").click();

    const layout = await page.evaluate(() => {
      const sheetBody = document.querySelector(".mobile-sheet__body")?.getBoundingClientRect();
      const dome = document.querySelector(".mobile-sheet .sun-dome")?.getBoundingClientRect();
      return {
        sheetBody: sheetBody ? { height: sheetBody.height } : null,
        dome: dome ? { width: dome.width, height: dome.height } : null,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    expect(layout.sheetBody).not.toBeNull();
    expect(layout.dome).not.toBeNull();
    expect(layout.dome!.width).toBeLessThanOrEqual(150);
    expect(layout.dome!.height).toBeLessThan(layout.sheetBody!.height);
    expect(layout.horizontalOverflow).toBe(false);
  });

  test("loads a synthetic STL after dropping degenerate facets", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("stl-file-input").setInputFiles(degenerateMiniPath);

    await expect(page.getByRole("heading", { name: "degenerate-mini.stl" }).first()).toBeVisible();
    await expect(page.getByText("Loaded degenerate-mini.stl.")).toBeVisible();
    await expect(page.getByText("2 tris").first()).toBeVisible();
    await expect(page.getByText("1. X -90°")).toBeVisible();
    await expect(page.getByTestId("global-load-feedback")).toHaveCount(0);
  });
});
