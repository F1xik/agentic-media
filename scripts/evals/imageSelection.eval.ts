// @vitest-environment node
//
// REAL model eval — runs the live image-selection judge (vision) against
// generated candidate images and confirms it picks the one that matches the
// spec. This is NOT part of `npm run test`; it runs via `npm run eval` and the
// `evals` workflow whenever the image-judge prompt changes. Requires the
// `claude` CLI and CLAUDE_CODE_OAUTH_TOKEN.
//
// The candidates are solid-colour images and the metadata hints (alt text,
// avg_color) are deliberately neutral/empty, so the ONLY way to pick correctly
// is to actually open and look at the pixels via the `Read` tool. That makes
// this a true end-to-end check that the vision judge works — catching the
// failure mode where a broken judge silently defaults to candidate 0.

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  evaluateImageCandidates,
  type Candidate,
  type ImageEvalContext,
} from "../lib/imageEvaluator.ts";

/** A vertical solid-colour PNG the judge has to read to identify. */
function solidColor(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: { width: 360, height: 640, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

// Neutral, identical metadata for every candidate so neither alt text nor
// avg_color can be used as a shortcut — the choice must come from the pixels.
function neutral(id: number): Candidate {
  return {
    id,
    alt: "a solid colour background",
    avgColor: "",
    photographer: "",
  };
}

describe("image-selection judge", () => {
  it("picks the candidate whose colour matches the spec by looking at the pixels", async () => {
    const ctx: ImageEvalContext = {
      image_query: "red",
      image_prompt:
        "a vivid, saturated solid RED background filling the entire frame",
      topic: "Colour",
      fact_text: "Red light has the longest wavelength of visible colours.",
    };

    // Order: green (0), red (1), blue (2). The correct answer is the middle one,
    // so a judge that blindly returns index 0 (the silent-failure default) fails.
    const images = [
      await solidColor(0, 170, 0),
      await solidColor(220, 0, 0),
      await solidColor(0, 0, 200),
    ];
    const candidates = [neutral(1), neutral(2), neutral(3)];

    const choice = await evaluateImageCandidates({ ctx, candidates, images });

    expect(
      choice.bestIndex,
      `expected the red image (index 1); reasons: ${choice.reasons.join("; ")}`,
    ).toBe(1);
    expect(choice.reasons.length).toBeGreaterThan(0);
  });
});
