import { defineConfig } from "vitest/config";

// Config for the REAL model-graded eval suite (`npm run eval`). These specs
// spawn the `claude` CLI, so they are slow, token-costing, and inherently a bit
// non-deterministic — kept out of the default `npm run test` run (whose default
// `**/*.test.ts` glob already excludes `*.eval.ts`) and run only on prompt
// changes via the `evals` workflow.
export default defineConfig({
  test: {
    include: ["scripts/evals/**/*.eval.ts"],
    environment: "node",
    // Real model calls are slow; give each generous time and serialize files to
    // stay friendly to rate limits.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    // A single unlucky model roll shouldn't fail CI; retry before giving up.
    retry: 2,
  },
});
