import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const browserGlobals = {
  ArrayBuffer: "readonly",
  Blob: "readonly",
  ChangeEvent: "readonly",
  console: "readonly",
  crypto: "readonly",
  document: "readonly",
  File: "readonly",
  HTMLButtonElement: "readonly",
  HTMLDivElement: "readonly",
  HTMLInputElement: "readonly",
  KeyboardEvent: "readonly",
  localStorage: "readonly",
  PointerEvent: "readonly",
  requestAnimationFrame: "readonly",
  Storage: "readonly",
  window: "readonly",
};

export default [
  {
    ignores: ["dist", "coverage", "node_modules", "playwright-report", "test-results"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: browserGlobals,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
