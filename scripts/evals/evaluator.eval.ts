// @vitest-environment node
//
// REAL model eval — exercises the live evaluator prompt against curated specs to
// confirm it accepts sound items and rejects unsound ones. NOT part of
// `npm run test`; runs via `npm run eval` and the `evals` workflow on prompt
// changes. Requires the `claude` CLI and CLAUDE_CODE_OAUTH_TOKEN.
//
// Cases are chosen to be robust to model variance: each "bad" spec violates a
// criterion the evaluator can judge without unreliable character counting
// (false claim, hashtags, embedded image text, invalid music id).

import { describe, it, expect } from "vitest";
import { evaluateSpec } from "../lib/specEvaluator.ts";

const MUSIC = ["carefree", "inspired", "wholesome"];

const goodSpec = {
  topic: "Marine biology",
  hook: "How many hearts does an octopus actually have?",
  fact_text: "Octopuses have three hearts and blue blood.",
  image_prompt: "A deep blue ocean scene with an octopus drifting past coral",
  music: "carefree",
};

describe("evaluator", () => {
  it("approves a true, well-formed, surprising fact", async () => {
    const verdict = await evaluateSpec({
      spec: goodSpec,
      validMusicIds: MUSIC,
    });
    expect(verdict.approved, `issues: ${verdict.issues.join("; ")}`).toBe(true);
  });

  it("rejects a factually false claim", async () => {
    const spec = {
      ...goodSpec,
      topic: "Astronomy",
      fact_text: "The Sun orbits the Earth once every 24 hours.",
      image_prompt: "A starry night sky over a calm horizon",
    };
    const verdict = await evaluateSpec({ spec, validMusicIds: MUSIC });
    expect(verdict.approved).toBe(false);
    expect(verdict.issues.length).toBeGreaterThan(0);
  });

  it("rejects a fact that contains hashtags", async () => {
    const spec = {
      ...goodSpec,
      fact_text: "Octopuses have three hearts and blue blood. #facts #ocean",
    };
    const verdict = await evaluateSpec({ spec, validMusicIds: MUSIC });
    expect(verdict.approved).toBe(false);
  });

  it("rejects an image prompt that requests embedded text", async () => {
    const spec = {
      ...goodSpec,
      image_prompt:
        "An octopus with the bold caption 'THREE HEARTS' written across the top",
    };
    const verdict = await evaluateSpec({ spec, validMusicIds: MUSIC });
    expect(verdict.approved).toBe(false);
  });

  it("rejects a spec whose music id is not in the allowed list", async () => {
    const spec = { ...goodSpec, music: "dramatic-trailer" };
    const verdict = await evaluateSpec({ spec, validMusicIds: MUSIC });
    expect(verdict.approved).toBe(false);
  });
});
