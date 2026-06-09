// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./generationSpec.ts", () => ({
  requestGenerationSpec: vi.fn(),
}));
vi.mock("./specEvaluator.ts", () => ({
  evaluateSpec: vi.fn(),
}));

import { produceReviewedSpec } from "./producer.ts";
import { requestGenerationSpec } from "./generationSpec.ts";
import { evaluateSpec } from "./specEvaluator.ts";

const MUSIC = ["carefree", "inspired", "wholesome"];

const spec = {
  topic: "Marine biology",
  hook: "How many hearts does an octopus have?",
  fact_text: "Octopuses have three hearts and blue blood.",
  image_query: "octopus",
  image_prompt: "A deep blue ocean with an octopus",
  music: "carefree",
};

const opts = { avoidTopics: ["space"], validMusicIds: MUSIC };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("produceReviewedSpec", () => {
  it("returns immediately when the first attempt is approved", async () => {
    vi.mocked(requestGenerationSpec).mockResolvedValue(spec);
    vi.mocked(evaluateSpec).mockResolvedValue({ approved: true, issues: [] });

    const result = await produceReviewedSpec(opts);

    expect(result).toEqual({
      spec,
      verdict: { approved: true, issues: [] },
      attempts: 1,
    });
    expect(requestGenerationSpec).toHaveBeenCalledTimes(1);
    expect(evaluateSpec).toHaveBeenCalledTimes(1);
  });

  it("feeds the critique back and retries until approved", async () => {
    vi.mocked(requestGenerationSpec).mockResolvedValue(spec);
    vi.mocked(evaluateSpec)
      .mockResolvedValueOnce({ approved: false, issues: ["too bland"] })
      .mockResolvedValueOnce({ approved: true, issues: [] });

    const result = await produceReviewedSpec(opts);

    expect(result.attempts).toBe(2);
    // First attempt has no feedback; the second receives the prior issues.
    expect(vi.mocked(requestGenerationSpec).mock.calls[0][0]).toMatchObject({
      feedback: [],
    });
    expect(vi.mocked(requestGenerationSpec).mock.calls[1][0]).toMatchObject({
      feedback: ["too bland"],
    });
  });

  it("anchors every attempt to the trending topic", async () => {
    vi.mocked(requestGenerationSpec).mockResolvedValue(spec);
    vi.mocked(evaluateSpec)
      .mockResolvedValueOnce({ approved: false, issues: ["too bland"] })
      .mockResolvedValueOnce({ approved: true, issues: [] });

    await produceReviewedSpec({ ...opts, trendingTopic: "Olympic swimming" });

    expect(vi.mocked(requestGenerationSpec).mock.calls[0][0]).toMatchObject({
      trendingTopic: "Olympic swimming",
    });
    expect(vi.mocked(requestGenerationSpec).mock.calls[1][0]).toMatchObject({
      trendingTopic: "Olympic swimming",
    });
  });

  it("throws with the issues once attempts are exhausted", async () => {
    vi.mocked(requestGenerationSpec).mockResolvedValue(spec);
    vi.mocked(evaluateSpec).mockResolvedValue({
      approved: false,
      issues: ["unverifiable claim"],
    });

    await expect(
      produceReviewedSpec({ ...opts, maxAttempts: 2 }),
    ).rejects.toThrow(/rejected after 2 attempts: unverifiable claim/);
    expect(requestGenerationSpec).toHaveBeenCalledTimes(2);
  });

  it("invokes onRound after every evaluation round", async () => {
    vi.mocked(requestGenerationSpec).mockResolvedValue(spec);
    vi.mocked(evaluateSpec)
      .mockResolvedValueOnce({ approved: false, issues: ["too bland"] })
      .mockResolvedValueOnce({ approved: true, issues: [] });
    const onRound = vi.fn();

    await produceReviewedSpec({ ...opts, onRound });

    expect(onRound).toHaveBeenCalledTimes(2);
    expect(onRound).toHaveBeenNthCalledWith(1, {
      attempt: 1,
      spec,
      verdict: { approved: false, issues: ["too bland"] },
    });
    expect(onRound).toHaveBeenNthCalledWith(2, {
      attempt: 2,
      spec,
      verdict: { approved: true, issues: [] },
    });
  });
});
