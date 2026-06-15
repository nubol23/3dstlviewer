import { existsSync } from "node:fs";
import { test, expect } from "@playwright/test";

const lizardPath = "/Users/rafael.villca/Downloads/root-miniatures-lizard.stl";

test.describe("STL viewer", () => {
  test.skip(!existsSync(lizardPath), `Missing fixture: ${lizardPath}`);

  test("loads and manipulates the lizard STL without render errors", async ({ page }) => {
    const messages: string[] = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        messages.push(message.text());
      }
    });
    page.on("pageerror", (error) => messages.push(error.message));

    await page.goto("/");
    await page.getByTestId("stl-file-input").setInputFiles(lizardPath);
    await expect(page.getByText("root-miniatures-lizard.stl", { exact: false })).toBeVisible();
    await expect(page.getByTestId("load-error")).toHaveCount(0);

    const dataUrlLength = await page.locator("canvas").evaluate((canvas) => canvas.toDataURL("image/png").length);
    expect(dataUrlLength).toBeGreaterThan(1000);

    await page.getByTestId("rotate-x-positive").click();
    await page.getByTestId("rotate-y-positive").click();
    await expect(page.getByText("1. X +90°")).toBeVisible();
    await expect(page.getByText("2. Y +90°")).toBeVisible();

    await page.getByTestId("reset-model-orientation-button").click();
    await expect(page.getByText("Identity")).toBeVisible();

    const shadowSoftness = page.getByRole("slider", { name: "Shadow Softness" }).first();
    await shadowSoftness.fill("1");
    await shadowSoftness.fill("0");

    const relevantMessages = messages.filter(
      (message) => !message.includes("React DevTools") && !message.includes("GPU stall due to ReadPixels"),
    );
    expect(relevantMessages).toEqual([]);
  });

  test("keeps mobile sheet and viewport non-overlapping at 320x568", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");

    const boxes = await page.evaluate(() => {
      const viewport = document.querySelector(".viewport")?.getBoundingClientRect();
      const sheet = document.querySelector(".mobile-sheet")?.getBoundingClientRect();
      return {
        viewport: viewport ? { top: viewport.top, bottom: viewport.bottom, height: viewport.height } : null,
        sheet: sheet ? { top: sheet.top, bottom: sheet.bottom, height: sheet.height } : null,
      };
    });

    expect(boxes.viewport).not.toBeNull();
    expect(boxes.sheet).not.toBeNull();
    expect(boxes.viewport!.height).toBeGreaterThan(100);
    expect(boxes.sheet!.top).toBeGreaterThanOrEqual(boxes.viewport!.bottom - 1);
    expect(boxes.sheet!.bottom).toBeLessThanOrEqual(568);
  });
});
