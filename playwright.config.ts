import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    ...(process.env.PLAYWRIGHT_GPU === "1" ? {
      channel: "chrome",
      launchOptions: { args: ["--enable-gpu", "--use-angle=gl", "--ignore-gpu-blocklist"] },
    } : {}),
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
