// ==========================================================================
// ESLint flat config
// --------------------------------------------------------------------------
// Migrated from .eslintrc.cjs: ESLint 9 no longer reads the legacy format, so
// `npm run lint` had been failing outright rather than reporting anything.
//
// Three environments, deliberately separated — browser globals must not be
// available to the serverless API, and Node globals must not be available to
// the browser bundle, or a mistake in either direction lints clean.
// ==========================================================================
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage", "*.config.js", "*.config.ts"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ---- browser ----------------------------------------------------------
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // ---- serverless API ---------------------------------------------------
  {
    files: ["api/**/*.ts", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // Server code logs deliberately; console is the observability channel.
      "no-console": "off",
    },
  },

  // ---- React contexts ---------------------------------------------------
  // A provider and its companion hook in one file is the canonical React
  // pattern. react-refresh would rather they were split; splitting every
  // context into two files to satisfy a dev-server nicety is worse code.
  {
    files: ["src/app/*Context.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },

  // ---- tests ------------------------------------------------------------
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // Test doubles legitimately need loose typing at the seam.
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
