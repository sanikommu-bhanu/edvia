import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The live runner has its own config and must never join the default run.
    exclude: ["tests/live/**"],
    setupFiles: ["tests/setup.ts"],
    // The whole suite is deterministic and in-memory; anything slower than
    // this is a hang, not a slow test.
    testTimeout: 10000,
  },
});
