// @vitest-environment node
//
// REAL model eval — runs the live, web-grounded trending-topic picker and feeds
// its result into the producer prompt, then grades the resulting fact. This is
// NOT part of `npm run test`; it runs via `npm run eval` and the `evals`
// workflow whenever a prompt changes. Requires the `claude` CLI,
// CLAUDE_CODE_OAUTH_TOKEN, and outbound web access for WebSearch.

import { describe, it, expect } from "vitest";
import { pickTrendingTopic } from "../lib/trendingTopic.ts";
import { requestGenerationSpec } from "../lib/generationSpec.ts";
import { gradeSpec } from "../lib/factGrader.ts";

const MUSIC = ["carefree", "inspired", "wholesome"];

describe("trending topic picker", () => {
  it("returns a current 2-4 word subject area and anchors a still-accurate fact", async () => {
    const trending = await pickTrendingTopic({ avoidTopics: [] });

    // Web search may be unavailable on the runner; the pipeline tolerates that
    // by design (free-choice fallback), so a null result is a soft skip here
    // rather than a hard failure.
    if (!trending) {
      console.warn("trending pick unavailable (no web access?); skipping");
      return;
    }

    const topicWords = trending.topic.split(/\s+/).filter(Boolean).length;
    expect(
      topicWords,
      `trending topic should be 2-4 words, got "${trending.topic}"`,
    ).toBeGreaterThanOrEqual(2);
    expect(topicWords).toBeLessThanOrEqual(4);

    // The trend is only a seed: the producer must still yield a surprising,
    // VERIFIABLE fact. Grade it to prove anchoring doesn't erode accuracy.
    const spec = await requestGenerationSpec({
      avoidTopics: [],
      validMusicIds: MUSIC,
      trendingTopic: trending.topic,
    });

    const grade = await gradeSpec({ spec });
    const ctx = `trend="${trending.topic}" spec=${JSON.stringify(spec)} grader=${grade.notes}`;
    expect(grade.accuracy, ctx).toBeGreaterThanOrEqual(4);
  });
});
