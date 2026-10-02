import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { test as base, expect, type Page } from "@playwright/test";

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

type TabName = "Light" | "Values" | "Model" | "Presets";

async function openTab(page: Page, name: TabName): Promise<void> {
  const tab = page.getByRole("tab", { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

async function selectStudy(page: Page, study: "smooth" | 3 | 4 | 5 | 6 | 7 | 8): Promise<void> {
  const option = page
    .getByRole("radiogroup", { name: "Value study" })
    .getByRole("radio", { name: study === "smooth" ? "Smooth" : `${study} values`, exact: true });
  await option.click();
  await expect(option).toBeChecked();
}

async function selectSetup(page: Page, name: string): Promise<void> {
  const setup = page.getByRole("radiogroup", { name: "Lighting setup" }).getByRole("radio", { name, exact: true });
  await setup.click();
  await expect(setup).toBeChecked();
}

const IMPORTED_POSE = "Standing as imported, with Z up.";
const TURNED_POSE = /Turned from the imported pose/;

async function expectLoaded(page: Page, fileName: string): Promise<void> {
  await expect(page.locator(".app-bar__file-name")).toHaveText(fileName);
}

test.describe("STL viewer", () => {
  test("loads and manipulates a z-up STL with the default import orientation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Miniature Light Studio")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Open an STL to study its values" })).toBeVisible();
    await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
    await expectLoaded(page, "z-up-mini.stl");
    const loadedToast = page.getByText("Opened z-up-mini.stl.");
    await expect(loadedToast).toBeVisible();
    await expect(page.getByRole("heading", { name: "Open an STL to study its values" })).toHaveCount(0);
    await openTab(page, "Model");
    await expect(page.getByRole("heading", { name: "z-up-mini.stl" })).toBeVisible();
    const summary = page.getByTestId("orientation-summary");
    await expect(summary).toHaveText(IMPORTED_POSE);
    await expect(page.getByTestId("reset-model-orientation-button")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Undo turn" })).toBeDisabled();
    await expect(loadedToast).toBeHidden({ timeout: 6000 });

    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);

    await page.getByRole("button", { name: "Turn right" }).click();
    await page.getByRole("button", { name: "Tip forward" }).click();
    await expect(summary).toHaveText(TURNED_POSE);
    await page.getByRole("button", { name: "Undo turn" }).click();
    await page.getByRole("button", { name: "Undo turn" }).click();
    await expect(summary).toHaveText(IMPORTED_POSE);
    await expect(page.getByRole("button", { name: "Undo turn" })).toBeDisabled();

    await page.getByRole("button", { name: "Roll left" }).click();
    await page.getByTestId("reset-model-orientation-button").click();
    await expect(summary).toHaveText(IMPORTED_POSE);
    await page.getByRole("button", { name: "Undo turn" }).click();
    await expect(summary).toHaveText(TURNED_POSE);
    await page.getByTestId("reset-model-orientation-button").click();

    await selectStudy(page, 3);
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);
    await openTab(page, "Values");
    await page.getByRole("slider", { name: "Shadow Value" }).fill("30");
    await expect(page.getByRole("slider", { name: "Shadow Value" })).toHaveValue("30");

    await openTab(page, "Light");
    await selectSetup(page, "Broad Zenithal");
    await expect(page.getByTestId("light-azimuth-slider")).toBeDisabled();
    await expect(page.getByTestId("light-elevation-slider")).toBeDisabled();
    await selectSetup(page, "Directional");
    await expect(page.getByTestId("light-azimuth-slider")).toBeEnabled();

    await selectStudy(page, 5);
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);
    await selectStudy(page, "smooth");
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);

    const shadowSoftness = page.getByRole("slider", { name: "Shadow Softness" });
    await shadowSoftness.fill("1");
    await shadowSoftness.fill("0");

    await page.getByRole("button", { name: "Hide controls" }).click();
    await expect(page.locator("#inspector")).toBeHidden();
    await expectDesktopWorkbenchLayout(page);
    await page.getByRole("button", { name: "Show controls" }).click();
    await expect(page.locator("#inspector")).toBeVisible();

    await page.getByTestId("stl-file-input").setInputFiles({
      name: "invalid.stl",
      mimeType: "model/stl",
      buffer: Buffer.from([0]),
    });
    const errorToast = page.getByText(/Invalid STL content for invalid\.stl/);
    await expect(errorToast).toBeVisible();
    await expectLoaded(page, "z-up-mini.stl");
    await expect(errorToast).toBeHidden({ timeout: 8000 });
  });

  test("validates quantized modes on a synthetic tiny band island after default orientation", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("stl-file-input").setInputFiles(valueBandIslandPath);

    await expectLoaded(page, "value-band-island.stl");
    await expect(page.getByText("Opened value-band-island.stl.")).toBeVisible();
    await expect(page.getByText("4 tris").first()).toBeVisible();
    await openTab(page, "Model");
    await expect(page.getByTestId("orientation-summary")).toHaveText(IMPORTED_POSE);
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);

    for (const count of [3, 4, 5, 6, 7, 8] as const) {
      await selectStudy(page, count);
      await expect(page.getByTestId("orientation-summary")).toHaveText(IMPORTED_POSE);
      await expectCanvasToRender(page);
      await expectDesktopWorkbenchLayout(page);
      await expect(page.getByTestId("value-ramp-preview").locator("span")).toHaveCount(count);
    }
    await selectStudy(page, "smooth");
    await expect(page.getByTestId("value-ramp-preview").locator("span")).toHaveCount(0);
    await expectCanvasToRender(page);
    await expectDesktopWorkbenchLayout(page);
  });

  test("keeps mobile controls usable at 320x568", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
    await expectLoaded(page, "z-up-mini.stl");
    const inspector = page.locator(".inspector");
    const sheetBody = page.locator("#inspector-body");
    await expect(sheetBody).toBeHidden();

    await page.getByRole("tab", { name: "Model" }).click();
    await expect(sheetBody).toBeVisible();
    const summary = inspector.getByTestId("orientation-summary");
    await expect(summary).toHaveText(IMPORTED_POSE);
    await inspector.getByRole("button", { name: "Turn right" }).click();
    await expect(summary).toHaveText(TURNED_POSE);
    await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
    await expect(summary).toHaveText(IMPORTED_POSE);
    await expect(inspector.getByRole("button", { name: "Undo turn" })).toBeDisabled();

    const measure = () => page.evaluate(() => {
      const rect = (selector: string) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        return box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height } : null;
      };
      return {
        viewport: rect(".viewport"),
        inspector: rect(".inspector"),
        studyBar: rect(".study-bar"),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    const open = await measure();
    expect(open.viewport!.height).toBeGreaterThan(160);
    expect(open.inspector!.bottom).toBeLessThanOrEqual(568);
    expect(open.studyBar!.bottom).toBeLessThanOrEqual(open.inspector!.top);
    expect(open.studyBar!.top).toBeGreaterThanOrEqual(open.viewport!.top);
    expect(open.horizontalOverflow).toBe(false);

    await page.getByRole("tab", { name: "Model" }).click();
    await expect(sheetBody).toBeHidden();
    const collapsed = await measure();
    expect(collapsed.viewport!.height).toBeGreaterThan(open.viewport!.height + 150);
    expect(collapsed.inspector!.bottom).toBeLessThanOrEqual(568);
    expect(collapsed.horizontalOverflow).toBe(false);

    await page.getByRole("button", { name: "Show controls" }).click();
    await expect(sheetBody).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheetBody).toBeHidden();

    await page.getByRole("tab", { name: "Light" }).click();
    await expect(sheetBody).toBeVisible();
    await selectSetup(page, "Broad Zenithal");
    await expect(inspector.getByTestId("light-azimuth-slider")).toBeDisabled();
    await expect(inspector.getByTestId("light-elevation-slider")).toBeDisabled();
    await inspector.getByTestId("sun-dome").scrollIntoViewIfNeeded();
    const lightLayout = await page.evaluate(() => {
      const body = document.querySelector("#inspector-body")!.getBoundingClientRect();
      const pad = document.querySelector(".dome-control__pad")!.getBoundingClientRect();
      const dome = document.querySelector(".dome")!.getBoundingClientRect();
      return { body: { left: body.left, right: body.right }, pad: { left: pad.left, right: pad.right }, dome: { width: dome.width, height: dome.height } };
    });
    expect(lightLayout.dome.width).toBeLessThanOrEqual(160);
    expect(lightLayout.dome.height).toBeLessThanOrEqual(160);
    expect(lightLayout.pad.left).toBeGreaterThanOrEqual(lightLayout.body.left);
    expect(lightLayout.pad.right).toBeLessThanOrEqual(lightLayout.body.right);

    await page.getByRole("tab", { name: "Values" }).click();
    await selectStudy(page, 3);
    await expectCanvasToRender(page);
    await page.getByTestId("shadow-value-slider").fill("26");
    await expect(page.getByTestId("shadow-value-slider")).toHaveValue("26");
    await selectStudy(page, 8);
    await expectCanvasToRender(page);
    await selectStudy(page, "smooth");
    await expectCanvasToRender(page);

    expect((await measure()).horizontalOverflow).toBe(false);
  });

  test("keeps compact mobile light layout at 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("tab", { name: "Light" }).click();
    await selectSetup(page, "Broad Zenithal");

    const layout = await page.evaluate(() => {
      const sheetBody = document.querySelector("#inspector-body")?.getBoundingClientRect();
      const dome = document.querySelector(".dome")?.getBoundingClientRect();
      const viewport = document.querySelector(".viewport")?.getBoundingClientRect();
      return {
        sheetBody: sheetBody ? { height: sheetBody.height } : null,
        dome: dome ? { width: dome.width, height: dome.height } : null,
        viewport: viewport ? { height: viewport.height } : null,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    expect(layout.sheetBody).not.toBeNull();
    expect(layout.dome).not.toBeNull();
    expect(layout.dome!.width).toBeLessThanOrEqual(160);
    expect(layout.dome!.height).toBeLessThan(layout.sheetBody!.height);
    expect(layout.viewport!.height).toBeGreaterThan(300);
    expect(layout.horizontalOverflow).toBe(false);
  });

  test("loads a synthetic STL after dropping degenerate facets", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("stl-file-input").setInputFiles(degenerateMiniPath);

    await expectLoaded(page, "degenerate-mini.stl");
    await expect(page.getByText("Opened degenerate-mini.stl.")).toBeVisible();
    await expect(page.getByText("2 tris").first()).toBeVisible();
    await openTab(page, "Model");
    await expect(page.getByTestId("orientation-summary")).toHaveText(IMPORTED_POSE);
  });
});

test("updates independent lights and screen-space values through the study controls", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
  await expectLoaded(page, "z-up-mini.stl");
  await selectSetup(page, "Double Directional");
  const ratio = page.getByRole("slider", { name: "Second Light Ratio", exact: true });
  await ratio.fill("0");
  const keyOnly = await page.locator("canvas").screenshot();
  await ratio.fill("1.5");
  await expect.poll(async () => (await page.locator("canvas").screenshot()).equals(keyOnly)).toBe(false);
  await selectSetup(page, "Local Studio");
  const distance = page.getByRole("slider", { name: "Source Distance", exact: true });
  await distance.fill("1");
  const near = await page.locator("canvas").screenshot();
  await distance.fill("5");
  await expect.poll(async () => (await page.locator("canvas").screenshot()).equals(near)).toBe(false);
  await selectStudy(page, 3);
  await openTab(page, "Values");
  await page.getByRole("slider", { name: "Smoothing Radius", exact: true }).fill("3");
  await page.getByRole("slider", { name: "Contrast", exact: true }).fill("2.6");
  await selectStudy(page, 5);
  const boundary = (index: number) => page.getByRole("slider", { name: `Boundary ${index}`, exact: true });
  await expect(boundary(1)).toHaveAttribute("aria-valuenow", "20");
  await expect(boundary(2)).toHaveAttribute("aria-valuenow", "40");
  // Handles stop one step short of a neighbor instead of crossing or merging bands.
  await boundary(2).focus();
  for (let step = 0; step < 25; step++) await page.keyboard.press("ArrowLeft");
  await expect(boundary(2)).toHaveAttribute("aria-valuenow", "21");
  await boundary(4).focus();
  await page.keyboard.press("End");
  await expect(boundary(4)).toHaveAttribute("aria-valuenow", "99");
  const editor = page.getByTestId("threshold-editor");
  const box = (await editor.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
  await expect.poll(async () => Number(await boundary(3).getAttribute("aria-valuenow"))).toBeGreaterThan(70);
  expect(Number(await boundary(3).getAttribute("aria-valuenow"))).toBeLessThan(80);
  await selectStudy(page, 3);
  await expect(boundary(1)).toHaveAttribute("aria-valuenow", "33");
  await expect(boundary(3)).toHaveCount(0);
  await openTab(page, "Presets");
  await page.getByRole("button", { name: "Save preset", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preset 1 Local Studio · 3 values", exact: true })).toBeVisible();
  await page.reload();
  await openTab(page, "Values");
  await expect(page.getByRole("slider", { name: "Smoothing Radius", exact: true })).toHaveValue("3");
  await expect(page.getByRole("slider", { name: "Contrast", exact: true })).toHaveValue("2.6");
  await openTab(page, "Light");
  await expect(page.getByRole("radio", { name: "Local Studio", exact: true })).toBeChecked();
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
  await expectLoaded(page, "z-up-mini.stl");
  await expect(page.getByText("Opened z-up-mini.stl.", { exact: true })).toBeHidden({ timeout: 8000 });
  const previewPixels = PNG.sync.read(await page.locator("canvas").screenshot());
  await page.getByRole("button", { name: "Refine lighting", exact: true }).click();
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
  await selectStudy(page, 5);
  await openTab(page, "Values");
  await page.getByRole("slider", { name: "Contrast", exact: true }).fill("2.5");
  await expect(status).toContainText("Refined");
  await openTab(page, "Light");
  await page.getByRole("slider", { name: "Intensity", exact: true }).fill("4");
  await expect(status).toHaveText("Preview");
  await selectSetup(page, "Double Directional");
  await page.getByRole("slider", { name: "Azimuth", exact: true }).fill("350");
  await expect(page.getByRole("slider", { name: "Second Azimuth", exact: true })).toHaveValue("170");
  await page.getByRole("slider", { name: "Second Elevation", exact: true }).fill("25");
  await page.getByRole("button", { name: "Refine lighting", exact: true }).click();
  await expect(status).toContainText("Refined", { timeout: 45000 });
  await page.getByRole("slider", { name: "Azimuth", exact: true }).fill("0");
  await expect(page.getByRole("slider", { name: "Second Azimuth", exact: true })).toHaveValue("180");
  await expect(status).toHaveText("Preview");
  await page.getByRole("button", { name: "Refine lighting", exact: true }).click();
  await page.getByRole("button", { name: "Stop refinement", exact: true }).click();
  await expect(status).toHaveText("Preview");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("button", { name: "Refine lighting", exact: true })).toHaveCount(0);
});

test("links an opposing fill, unlinks without a jump, and restores settings and presets", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
  await expectLoaded(page, "z-up-mini.stl");
  await expect(page.getByText("Opened z-up-mini.stl.", { exact: true })).toBeHidden({ timeout: 8000 });
  await selectSetup(page, "Double Directional");
  const opposite = page.getByRole("switch", { name: "Keep Second Light Opposite", exact: true });
  const azimuth = page.getByRole("slider", { name: "Azimuth", exact: true });
  const secondAzimuth = page.getByRole("slider", { name: "Second Azimuth", exact: true });
  const secondElevation = page.getByRole("slider", { name: "Second Elevation", exact: true });
  const ratio = page.getByRole("slider", { name: "Second Light Ratio", exact: true });
  const savePreset = async () => {
    await openTab(page, "Presets");
    await page.getByRole("button", { name: "Save preset", exact: true }).click();
    await openTab(page, "Light");
  };
  await expect(opposite).toBeChecked();
  await expect(secondAzimuth).toBeDisabled();
  await expect(secondAzimuth).toHaveValue("135");
  await expect(ratio).toHaveValue("0.3");
  await expect(ratio).toHaveAttribute("min", "0");
  await expect(ratio).toHaveAttribute("max", "2");
  await ratio.fill("1.2");
  await secondElevation.fill("25");
  await azimuth.fill("175");
  await page.getByRole("button", { name: "Light direction pad", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(secondAzimuth).toHaveValue("0");
  await page.getByRole("slider", { name: "Elevation", exact: true }).fill("60");
  await expect(secondElevation).toHaveValue("25");
  await expect(ratio).toHaveValue("1.2");
  await savePreset();
  const linkedImage = await page.locator("canvas").screenshot();
  await opposite.uncheck();
  await expect(secondAzimuth).toBeEnabled();
  await expect(secondAzimuth).toHaveValue("0");
  expect(await page.locator("canvas").screenshot()).toEqual(linkedImage);
  await azimuth.fill("90");
  await expect(secondAzimuth).toHaveValue("0");
  // Once unlinked, marker 2 can be dragged on the dome without moving the key light.
  const dome = (await page.getByTestId("sun-dome").boundingBox())!;
  const marker = (await page.locator(".dome__marker--second").boundingBox())!;
  const radius = dome.width / 2 - 14;
  await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
  await page.mouse.down();
  await page.mouse.move(dome.x + dome.width / 2 - radius * 0.5, dome.y + dome.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(secondAzimuth).toHaveValue("270");
  await expect(secondElevation).toHaveValue("48");
  await expect(azimuth).toHaveValue("90");
  await secondAzimuth.fill("40");
  await ratio.fill("0.8");
  await savePreset();
  await page.reload();
  await expect(opposite).not.toBeChecked();
  await expect(secondAzimuth).toHaveValue("40");
  await expect(ratio).toHaveValue("0.8");
  await openTab(page, "Presets");
  await page.getByRole("button", { name: "Preset 1 Double Directional · smooth", exact: true }).click();
  await openTab(page, "Light");
  await expect(opposite).toBeChecked();
  await expect(secondAzimuth).toHaveValue("0");
  await openTab(page, "Presets");
  await page.getByRole("button", { name: "Preset 2 Double Directional · smooth", exact: true }).click();
  await openTab(page, "Light");
  await expect(opposite).not.toBeChecked();
  await expect(secondAzimuth).toHaveValue("40");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Light", exact: true }).click();
  const mobile = page.locator(".inspector");
  await expect(page.locator("#inspector-body")).toBeVisible();
  const mobileOpposite = mobile.getByRole("switch", { name: "Keep Second Light Opposite", exact: true });
  await mobileOpposite.check();
  await expect(mobile.getByRole("slider", { name: "Second Azimuth", exact: true })).toHaveValue("270");
  await mobile.getByRole("slider", { name: "Second Elevation", exact: true }).fill("35");
  await mobile.getByRole("slider", { name: "Azimuth", exact: true }).fill("350");
  await expect(mobile.getByRole("slider", { name: "Second Azimuth", exact: true })).toHaveValue("170");
  await expect(mobile.getByRole("slider", { name: "Second Elevation", exact: true })).toHaveValue("35");
  await mobileOpposite.uncheck();
  await expect(mobile.getByRole("slider", { name: "Second Azimuth", exact: true })).toBeEnabled();
  await expect(mobile.getByRole("slider", { name: "Second Azimuth", exact: true })).toHaveValue("170");
});

test("compares colored lighting with neutral values and persists the colors", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
  await expectLoaded(page, "z-up-mini.stl");
  await selectSetup(page, "Double Directional");
  const keyChoices = page.getByRole("radiogroup", { name: "Key light color" });
  const fillChoices = page.getByRole("radiogroup", { name: "Fill colors" });
  const white = keyChoices.getByRole("radio", { name: /White/ });
  const warm = keyChoices.getByRole("radio", { name: /Warm/ });
  const neutral = fillChoices.getByRole("radio", { name: /Neutral/ });
  const cool = fillChoices.getByRole("radio", { name: /Cool blue/ });
  const keyColor = page.getByLabel("Key Color", { exact: true });
  const secondColor = page.getByLabel("Second Light Color", { exact: true });
  const environmentColor = page.getByLabel("Environment Color", { exact: true });
  const floorColor = page.getByLabel("Floor Color", { exact: true });
  const grayscaleSwitch = page.getByRole("switch", { name: "Neutral Grayscale", exact: true });
  await expect(white).toBeChecked();
  await expect(neutral).toBeChecked();
  await keyColor.fill("#ee7040");
  await expect(white).not.toBeChecked();
  await expect(warm).not.toBeChecked();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await secondColor.fill("#507add");
  await environmentColor.fill("#d0dfef");
  await expect(neutral).not.toBeChecked();
  const grayscale = await page.locator("canvas").screenshot();
  await openTab(page, "Values");
  await grayscaleSwitch.uncheck();
  await expect.poll(async () => (await page.locator("canvas").screenshot()).equals(grayscale)).toBe(false);

  // A fill palette preserves the chosen key and the dome direction.
  await openTab(page, "Light");
  await page.getByRole("button", { name: "Light direction pad", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("slider", { name: "Azimuth", exact: true })).toHaveValue("320");
  await cool.click();
  await expect(cool).toBeChecked();
  await expect(keyColor).toHaveValue("#ee7040");
  await expect(page.getByRole("slider", { name: "Azimuth", exact: true })).toHaveValue("320");
  await expect(secondColor).toHaveValue("#a8c7ef");
  await expect(environmentColor).toHaveValue("#b6c9e3");
  await expect(floorColor).toHaveValue("#78899f");
  const coolFill = await page.locator("canvas").screenshot();
  await openTab(page, "Values");
  await grayscaleSwitch.check();
  await expect.poll(async () => (await page.locator("canvas").screenshot()).equals(coolFill)).toBe(false);
  await openTab(page, "Light");
  await expect(page.getByText(/Neutral Grayscale is on/)).toBeVisible();
  await page.reload();
  await expect(keyColor).toHaveValue("#ee7040");
  await expect(cool).toBeChecked();
  await page.getByRole("button", { name: "Show colors", exact: true }).click();
  await openTab(page, "Values");
  await expect(grayscaleSwitch).not.toBeChecked();

  await openTab(page, "Light");
  await warm.click();
  await expect(keyColor).toHaveValue("#ffe2b3");
  await expect(cool).toBeChecked();
  await page.reload();
  await expect(warm).toBeChecked();

  // Choosing a setup starts from white light and neutral fill, floor included.
  await selectSetup(page, "Reflected Fill");
  await expect(white).toBeChecked();
  await expect(neutral).toBeChecked();
  await expect(keyColor).toHaveValue("#ffffff");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Light", exact: true }).click();
  await expect(page.locator("#inspector-body")).toBeVisible();
  await warm.click();
  await cool.click();
  await expect(keyColor).toHaveValue("#ffe2b3");
  await selectSetup(page, "Directional");
  await expect(white).toBeChecked();
  await expect(neutral).toBeChecked();
  await page.getByRole("tab", { name: "Values", exact: true }).click();
  await expect(grayscaleSwitch).not.toBeChecked();
});

function syntheticBinaryStl(triangles: number): Buffer {
  const buffer = Buffer.alloc(84 + triangles * 50);
  buffer.writeUInt32LE(triangles, 80);
  for (let i = 0; i < triangles; i++) {
    const offset = 84 + i * 50 + 12;
    const x = (i % 1000) / 100, z = Math.floor(i / 1000) / 100;
    [x, 0, z, x + 0.01, 0, z, x, 0.01, z].forEach((value, index) => buffer.writeFloatLE(value, offset + index * 4));
  }
  return buffer;
}

test("shows loading progress and keeps the open model when loading is cancelled", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
  await expectLoaded(page, "z-up-mini.stl");
  await page.getByTestId("stl-file-input").setInputFiles({
    name: "large-sculpt.stl",
    mimeType: "model/stl",
    buffer: syntheticBinaryStl(400_000),
  });
  const card = page.locator(".load-card");
  await expect(card.getByRole("heading", { name: "Opening large-sculpt.stl" })).toBeVisible();
  await card.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText("Stopped opening large-sculpt.stl.")).toBeVisible();
  await expectLoaded(page, "z-up-mini.stl");
});

test.describe("touch rendering quality", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  const pixelRatio = (page: Page) =>
    page.locator("canvas").evaluate((element: HTMLCanvasElement) => element.width / element.clientWidth);

  test("renders phones at the full 2x study resolution at rest", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
    await expectLoaded(page, "z-up-mini.stl");
    await expect.poll(() => pixelRatio(page)).toBeCloseTo(2, 1);
    // The resting image stays at full resolution instead of cycling.
    const settled: number[] = [];
    for (let sample = 0; sample < 12; sample++) {
      settled.push(await pixelRatio(page));
      await page.waitForTimeout(150);
    }
    expect(settled.every((ratio) => Math.abs(ratio - 2) < 0.05)).toBe(true);

    await page.getByRole("tab", { name: "Light", exact: true }).click();
    await page.getByRole("slider", { name: "Intensity", exact: true }).fill("4");
    await expect.poll(() => pixelRatio(page)).toBeCloseTo(2, 1);
  });

  test("lowers phone resolution only while orbiting", async ({ page }) => {
    await page.goto("/");
    const softwareRenderer = await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext("webgl2")!;
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      return debug ? /SwiftShader|llvmpipe|software/i.test(String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))) : false;
    });
    test.skip(softwareRenderer, "Software frames outlast the restore delay; run with PLAYWRIGHT_GPU=1 on a GPU host");
    await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
    await expectLoaded(page, "z-up-mini.stl");
    await expect.poll(() => pixelRatio(page)).toBeCloseTo(2, 1);

    const box = (await page.locator("canvas").boundingBox())!;
    const y = box.y + box.height / 3;
    let x = box.x + box.width / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const whileDragging: number[] = [];
    for (let step = 0; step < 10; step++) {
      x += 6;
      await page.mouse.move(x, y);
      whileDragging.push(await pixelRatio(page));
    }
    await page.mouse.up();
    expect(whileDragging.slice(2).every((ratio) => Math.abs(ratio - 1) < 0.05)).toBe(true);
    await expect.poll(() => pixelRatio(page)).toBeCloseTo(2, 1);
  });
});

test("renames, deletes and restores presets", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "Presets");
  const save = page.getByRole("button", { name: "Save preset", exact: true });
  await save.click();
  await save.click();
  await expect(page.getByText("2 of 8 used.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Rename Preset 2", exact: true }).click();
  await page.getByRole("textbox", { name: "Preset name" }).fill("Rim test");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Rim test Directional · smooth", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Preset 1", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Preset 1 / })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preset 1 Directional · smooth", exact: true })).toBeVisible();
  await page.reload();
  await openTab(page, "Presets");
  await expect(page.locator(".preset__name")).toHaveText(["Rim test", "Preset 1"]);
});

test("increases value separation without flattening the illuminated shadows", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("stl-file-input").setInputFiles(zUpMiniPath);
  await expectLoaded(page, "z-up-mini.stl");
  await expect(page.getByText("Opened z-up-mini.stl.", { exact: true })).toBeHidden({ timeout: 8000 });
  // A close, low studio source produces a continuous illumination gradient on
  // the existing small STL, so the test can inspect its darker value variations.
  await selectSetup(page, "Local Studio");
  await page.getByRole("slider", { name: "Source Distance", exact: true }).fill("1");
  await page.getByRole("slider", { name: "Intensity", exact: true }).fill("1");
  await page.getByRole("slider", { name: "Elevation", exact: true }).fill("20");
  await openTab(page, "Values");
  const control = page.getByRole("slider", { name: "Contrast", exact: true });
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
