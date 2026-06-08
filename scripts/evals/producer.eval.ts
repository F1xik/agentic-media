// @vitest-environment node
//
// REAL model eval — runs the live producer prompt and grades its output with a
// judge model. This is NOT part of `npm run test`; it runs via `npm run eval`
// and the `evals` workflow whenever a prompt changes. Requires the `claude` CLI
// and CLAUDE_CODE_OAUTH_TOKEN.

import { describe, it, expect } from "vitest";
import { requestGenerationSpec } from "../lib/generationSpec.ts";
import { gradeSpec } from "../lib/factGrader.ts";

const MUSIC = ["carefree", "inspired", "wholesome"];

describe("producer prompt", () => {
  it("yields a valid spec a judge model rates as accurate and engaging", async () => {
    // requestGenerationSpec throws unless the output parses and satisfies the
    // hard format constraints (non-empty fields, fact length, valid music), so
    // a successful return already proves format compliance.
    const spec = await requestGenerationSpec({
      avoidTopics: [],
      validMusicIds: MUSIC,
    });

    // Topic length (2-4 words) is only enforced by the prompt, so check it here
    // deterministically rather than relying on the judge.
    const topicWords = spec.topic.split(/\s+/).filter(Boolean).length;
    expect(
      topicWords,
      `topic should be 2-4 words, got "${spec.topic}"`,
    ).toBeGreaterThanOrEqual(2);
    expect(topicWords).toBeLessThanOrEqual(4);

    const grade = await gradeSpec({ spec });
    const ctx = `spec=${JSON.stringify(spec)} grader=${grade.notes}`;

    // Accuracy is the highest-stakes axis (a false "fun fact" is the worst
    // failure), so hold it to a strict bar; engagement is graded more leniently.
    expect(grade.accuracy, ctx).toBeGreaterThanOrEqual(4);
    expect(grade.engagement, ctx).toBeGreaterThanOrEqual(3);
    expect(grade.imagePromptClean, ctx).toBe(true);
  });
});
