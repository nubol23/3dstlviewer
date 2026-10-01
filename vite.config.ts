import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: mode === "github-pages" ? "/3dstlviewer/" : "/",
  plugins: [react()],
  test: {
    exclude: [
      "tmp/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "tests/**",
    ],
  },
}));
