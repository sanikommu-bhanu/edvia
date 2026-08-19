import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Config for the live evaluation runner only (`npm run eval`).
 *
 * Kept separate from vitest.config.ts so the default `npm test` never
 * reaches for the network, and so the live suite does NOT load
 * tests/setup.ts — it must talk to a real deployment, not the in-memory
 * Firestore double.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["tests/live/**/*.spec.ts"],
    testTimeout: 120000,
    hookTimeout: 60000,
    // One case at a time: the point is a readable transcript, and hammering
    // a live model in parallel just produces rate limits.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
