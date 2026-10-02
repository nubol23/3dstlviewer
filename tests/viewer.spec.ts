import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { test as base, expect, type Locator, type Page } from "@playwright/test";

const test = base.extend<{ assertNoConsoleErrors: void }>({
  assertNoConsoleErrors: [
    async ({ page }, use) => {
      // Chrome requests an optional favicon; keep that unrelated browser request
      // out of the renderer's console-error acceptance gate.
      await page.route("**/favicon.ico", route => route.fulfill({ status: 204, body: "" }));
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
      windowHeight: window.innerHeight,
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
  expect(layout.viewport!.bottom).toBeLessThanOrEqual(layout.windowHeight + 1);
}

async function selectRenderStyle(
  valueStudyControl: Locator,
  label: "Smooth" | "Stepped",
): Promise<void> {
  await valueStudyControl.getByRole("radio", { name: label }).click();
  await expect(valueStudyControl.getByRole("radio", { name: label })).toBeChecked();
}

async function selectValueCount(valueStudyControl: Locator, count: 3 | 4 | 5 | 6 | 7 | 8): Promise<void> {
  const select = valueStudyControl.getByRole("combobox", { name: "Values" });
  await select.selectOption(String(count));
  await expect(select).toHaveValue(String(count));
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

    const desktopValueStudy = page.getByTestId("value-study-control");
    await selectRenderStyle(desktopValueStudy, "Stepped");
    await selectValueCount(desktopValueStudy, 3);
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);
    await page.getByRole("slider", { name: "Shadow Value" }).fill("30");
    await expect(page.getByRole("slider", { name: "Shadow Value" })).toHaveValue("30");

    const desktopLightingMode = page.getByTestId("desktop-lighting-mode-control");
    await desktopLightingMode.getByRole("combobox", { name: "Lighting model" }).selectOption("broad-zenithal");
    await expect(desktopLightingMode.getByRole("combobox", { name: "Lighting model" })).toHaveValue("broad-zenithal");
    await expect(page.getByTestId("light-azimuth-slider").first()).toBeDisabled();
    await expect(page.getByTestId("light-elevation-slider").first()).toBeDisabled();
    await desktopLightingMode.getByRole("combobox", { name: "Lighting model" }).selectOption("directional");
    await expect(page.getByTestId("light-azimuth-slider").first()).toBeEnabled();

    await selectValueCount(desktopValueStudy, 5);
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);
    await selectRenderStyle(desktopValueStudy, "Smooth");
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

    const desktopValueStudy = page.getByTestId("value-study-control");
    await selectRenderStyle(desktopValueStudy, "Stepped");
    for (const count of [3, 4, 5, 6, 7, 8] as const) {
      await selectValueCount(desktopValueStudy, count);
      await expect(page.getByText("1. X -90°")).toBeVisible();
      await expectCanvasToRender(page);
      await expectDesktopWorkbenchLayout(page);
      await expect(page.getByTestId("desktop-value-ramp-preview").locator("span")).toHaveCount(count);
    }
    await selectRenderStyle(desktopValueStudy, "Smooth");
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
    const mobileLightingMode = page.getByTestId("mobile-lighting-mode-control");
    await mobileLightingMode.getByRole("combobox", { name: "Lighting model" }).selectOption("broad-zenithal");
    await expect(mobileLightingMode.getByRole("combobox", { name: "Lighting model" })).toHaveValue("broad-zenithal");
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
    await expect(page.getByTestId("mobile-value-study-control")).toBeVisible();
    const mobileValueStudy = page.getByTestId("mobile-value-study-control");
    await selectRenderStyle(mobileValueStudy, "Stepped");
    await selectValueCount(mobileValueStudy, 3);
    await expectCanvasToRender(page);
    await expect(page.getByTestId("mobile-value-ramp-control")).toBeVisible();
    await page.getByTestId("mobile-shadow-value-slider").fill("26");
    await expect(page.getByTestId("mobile-shadow-value-slider")).toHaveValue("26");
    await selectValueCount(mobileValueStudy, 8);
    await expectCanvasToRender(page);
    await selectRenderStyle(mobileValueStudy, "Smooth");
    await expectCanvasToRender(page);

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(horizontalOverflow).toBe(false);
  });

  test("keeps compact mobile light layout at 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("tab", { name: "Light" }).click();
    await page
      .getByTestId("mobile-lighting-mode-control")
      .getByRole("combobox", { name: "Lighting model" })
      .selectOption("broad-zenithal");

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

test("updates independent lights and screen-space values through the study controls", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
  await expect(page.getByRole("heading", { name: "z-up-mini.stl" }).first()).toBeVisible();
  await page.getByTestId("desktop-light-setup").selectOption("dual");
  const ratio = page.getByRole("slider", { name: "Second Light Ratio", exact: true }).first();
  await ratio.fill("0");
  const keyOnly = await page.locator("canvas").screenshot();
  await ratio.fill("1.5");
  await expect.poll(async () => (await page.locator("canvas").screenshot()).equals(keyOnly)).toBe(false);
  await page.getByTestId("desktop-light-setup").selectOption("local");
  const distance = page.getByRole("slider", { name: "Source Distance", exact: true }).first();
  await distance.fill("1");
  const near = await page.locator("canvas").screenshot();
  await distance.fill("5");
  await expect.poll(async () => (await page.locator("canvas").screenshot()).equals(near)).toBe(false);
  await selectRenderStyle(page.getByTestId("value-study-control"), "Stepped");
  await selectValueCount(page.getByTestId("value-study-control"), 3);
  await page.getByRole("slider", { name: "Smoothing Radius", exact: true }).first().fill("3");
  await page.getByRole("slider", { name: "Contrast", exact: true }).first().fill("2.6");
  await page.getByTestId("desktop-value-ramp-control").getByText("Band thresholds").click();
  await selectValueCount(page.getByTestId("value-study-control"), 5);
  await page.getByRole("slider", { name: "Boundary 1", exact: true }).first().fill("0.2");
  await page.getByRole("slider", { name: "Boundary 2", exact: true }).first().fill("0.21");
  await page.getByRole("slider", { name: "Boundary 3", exact: true }).first().fill("0.22");
  await expect(page.getByRole("slider", { name: "Boundary 2", exact: true }).first()).toBeDisabled();
  await page.getByRole("slider", { name: "Boundary 3", exact: true }).first().fill("0.6");
  await selectValueCount(page.getByTestId("value-study-control"), 3);
  await expect(page.getByRole("slider", { name: "Boundary 1", exact: true }).first()).toBeVisible();
  await page.getByRole("slider", { name: "Boundary 1", exact: true }).first().fill("0.25");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await page.reload();
  await expect(page.getByRole("slider", { name: "Smoothing Radius", exact: true }).first()).toHaveValue("3");
  await expect(page.getByRole("slider", { name: "Contrast", exact: true }).first()).toHaveValue("2.6");
  await expect(page.getByRole("combobox", { name: "Lighting model", exact: true }).first()).toHaveValue("local");
});

test("refines on desktop, keeps value edits, resets on light edits, and excludes mobile", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  const softwareRenderer = await page.locator("canvas").evaluate(canvas => {
    const gl = canvas.getContext("webgl2")!;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return debug ? /SwiftShader|llvmpipe|software/i.test(String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))) : false;
  });
  test.skip(softwareRenderer, "Refinement requires a hardware renderer; run with PLAYWRIGHT_GPU=1 on a GPU host");
  await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
  await expect(page.getByRole("heading", { name: "z-up-mini.stl" }).first()).toBeVisible();
  await expect(page.getByText("Loaded z-up-mini.stl.", { exact: true })).toBeHidden({ timeout: 8000 });
  const previewPixels = PNG.sync.read(await page.locator("canvas").screenshot());
  await page.getByRole("button", { name: "Refine Lighting", exact: true }).click();
  const status = page.locator(".refinement-controls [role=status]");
  await expect(status).toContainText("Refined", { timeout: 45000 });
  const refinedPixels = PNG.sync.read(await page.locator("canvas").screenshot());
  // Prove the displayed buffer is traced, not just a completed sample counter:
  // native traced occlusion darkens the ground, which receives no raster shadow.
  let shadowPixels = 0;
  for (let y = Math.floor(previewPixels.height * 0.65); y < previewPixels.height; y++) {
    for (let x = 0; x < previewPixels.width; x++) {
      const offset = (y * previewPixels.width + x) * 4;
      if (previewPixels.data[offset] - refinedPixels.data[offset] > 12) shadowPixels++;
    }
  }
  expect(shadowPixels).toBeGreaterThan(previewPixels.width * previewPixels.height * 0.003);
  await selectRenderStyle(page.getByTestId("value-study-control"), "Stepped");
  await page.getByRole("slider", { name: "Contrast", exact: true }).first().fill("2.5");
  await expect(status).toContainText("Refined");
  await page.getByRole("slider", { name: "Intensity", exact: true }).first().fill("4");
  await expect(status).toHaveText("Preview");
  await page.getByRole("button", { name: "Refine Lighting", exact: true }).click();
  await page.getByRole("button", { name: "Stop Refinement", exact: true }).click();
  await expect(status).toHaveText("Preview");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("button", { name: "Refine Lighting", exact: true })).toHaveCount(0);
});

test("compares colored lighting with neutral values and persists the colors", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
  await expect(page.getByRole("heading", { name: "z-up-mini.stl" }).first()).toBeVisible();
  await page.getByTestId("desktop-light-setup").selectOption("dual");
  await page.getByLabel("Key Color", { exact: true }).first().fill("#ee7040");
  await page.getByLabel("Second Light Color", { exact: true }).first().fill("#507add");
  await page.getByLabel("Environment Color", { exact: true }).first().fill("#d0dfef");
  const grayscale = await page.locator("canvas").screenshot();
  await page.getByRole("checkbox", { name: "Neutral Grayscale", exact: true }).first().uncheck();
  await expect.poll(async () => (await page.locator("canvas").screenshot()).equals(grayscale)).toBe(false);

  // Applying a fill palette preserves the chosen key and the dome direction.
  const dome = page.getByRole("button", { name: "Light direction pad", exact: true }).first();
  await dome.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("slider", { name: "Azimuth", exact: true }).first()).toHaveValue("320");
  await page.getByRole("button", { name: "Cool Blue Fill", exact: true }).first().click();
  await expect(page.getByLabel("Key Color", { exact: true }).first()).toHaveValue("#ee7040");
  await expect(page.getByRole("slider", { name: "Azimuth", exact: true }).first()).toHaveValue("320");
  await expect(page.getByLabel("Second Light Color", { exact: true }).first()).toHaveValue("#a8c7ef");
  await expect(page.getByLabel("Environment Color", { exact: true }).first()).toHaveValue("#b6c9e3");
  await expect(page.getByLabel("Floor Color", { exact: true }).first()).toHaveValue("#78899f");
  const coolFill = await page.locator("canvas").screenshot();
  await page.getByRole("button", { name: "Monochrome", exact: true }).first().click();
  await expect(page.getByRole("checkbox", { name: "Neutral Grayscale", exact: true }).first()).toBeChecked();
  await expect.poll(async () => (await page.locator("canvas").screenshot()).equals(coolFill)).toBe(false);
  await expect(page.getByLabel("Second Light Color", { exact: true }).first()).toHaveValue("#a8c7ef");
  await page.getByRole("button", { name: "Cool Blue Fill", exact: true }).first().click();
  await page.reload();
  await expect(page.getByLabel("Key Color", { exact: true }).first()).toHaveValue("#ee7040");
  await expect(page.getByLabel("Second Light Color", { exact: true }).first()).toHaveValue("#a8c7ef");
  await expect(page.getByRole("checkbox", { name: "Neutral Grayscale", exact: true }).first()).not.toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Light", exact: true }).click();
  await page.getByTestId("mobile-light-setup").selectOption("reflected");
  await page.locator(".mobile-sheet").getByRole("button", { name: "Monochrome", exact: true }).click();
  await page.locator(".mobile-sheet").getByRole("button", { name: "Cool Blue Fill", exact: true }).click();
  await expect(page.locator(".mobile-sheet").getByLabel("Environment Color", { exact: true })).toHaveValue("#b6c9e3");
  await page.getByRole("tab", { name: "View", exact: true }).click();
  await expect(page.locator(".mobile-sheet").getByRole("checkbox", { name: "Neutral Grayscale", exact: true })).not.toBeChecked();
});

test("increases value separation without flattening the illuminated shadows", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
  await expect(page.getByRole("heading", { name: "z-up-mini.stl" }).first()).toBeVisible();
  await expect(page.getByText("Loaded z-up-mini.stl.", { exact: true })).toBeHidden({ timeout: 8000 });
  // A close, low studio source produces a continuous illumination gradient on
  // the existing small STL, so the test can inspect its darker value variations.
  await page.getByTestId("desktop-light-setup").selectOption("local");
  await page.getByRole("slider", { name: "Source Distance", exact: true }).first().fill("1");
  await page.getByRole("slider", { name: "Intensity", exact: true }).first().fill("1");
  await page.getByRole("slider", { name: "Elevation", exact: true }).first().fill("20");
  const control = page.getByRole("slider", { name: "Contrast", exact: true }).first();
  await expect(control).toHaveValue("2.2");
  await control.fill("1");
  const neutral = PNG.sync.read(await page.locator("canvas").screenshot({ path: test.info().outputPath("contrast-neutral.png") }));
  await control.fill("2.2");
  const painted = PNG.sync.read(await page.locator("canvas").screenshot({ path: test.info().outputPath("contrast-painted.png") }));
  const shadowBefore: number[] = [], shadowAfter: number[] = [];
  const lightBefore: number[] = [], lightAfter: number[] = [];
  for (let y = Math.floor(neutral.height * 0.15); y < neutral.height * 0.85; y += 4) {
    for (let x = Math.floor(neutral.width * 0.15); x < neutral.width * 0.85; x += 4) {
      const offset = (y * neutral.width + x) * 4;
      const r = neutral.data[offset], g = neutral.data[offset + 1], b = neutral.data[offset + 2];
      // Ignore the tinted background and UI; compare identical rendered locations.
      if (Math.abs(r - g) > 1 || Math.abs(g - b) > 1) continue;
      if (r >= 60 && r <= 120) { shadowBefore.push(r); shadowAfter.push(painted.data[offset]); }
      if (r >= 145 && r <= 205) { lightBefore.push(r); lightAfter.push(painted.data[offset]); }
    }
  }
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  expect(shadowAfter.length).toBeGreaterThan(50);
  expect(lightAfter.length).toBeGreaterThan(50);
  expect(mean(lightAfter) - mean(shadowAfter)).toBeGreaterThan(mean(lightBefore) - mean(shadowBefore) + 15);
  // Shadow planes retain a useful range rather than collapsing to the dark endpoint.
  shadowAfter.sort((a, b) => a - b);
  expect(shadowAfter[Math.floor(shadowAfter.length * 0.95)] - shadowAfter[Math.floor(shadowAfter.length * 0.05)]).toBeGreaterThan(10);
  expect(shadowAfter[Math.floor(shadowAfter.length * 0.01)]).toBeGreaterThan(25);
});
