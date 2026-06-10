// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./generationSpec.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./generationSpec.ts")>()),
  requestGenerationSpec: vi.fn(),
}));
vi.mock("./specEvaluator.ts", () => ({
  evaluateSpec: vi.fn(),
}));

import { produceReviewedSpec } from "./producer.ts";
import {
  SpecValidationError,
  requestGenerationSpec,
} from "./generationSpec.ts";
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

  it("forwards a requested topic to every attempt", async () => {
    vi.mocked(requestGenerationSpec).mockResolvedValue(spec);
    vi.mocked(evaluateSpec)
      .mockResolvedValueOnce({ approved: false, issues: ["too bland"] })
      .mockResolvedValueOnce({ approved: true, issues: [] });

    await produceReviewedSpec({
      ...opts,
      requestedTopic: "deep sea creatures",
    });

    expect(vi.mocked(requestGenerationSpec).mock.calls[0][0]).toMatchObject({
      requestedTopic: "deep sea creatures",
    });
    expect(vi.mocked(requestGenerationSpec).mock.calls[1][0]).toMatchObject({
      requestedTopic: "deep sea creatures",
    });
  });

  it("forwards the facts to avoid to both the producer and the evaluator on every attempt", async () => {
    vi.mocked(requestGenerationSpec).mockResolvedValue(spec);
    vi.mocked(evaluateSpec)
      .mockResolvedValueOnce({ approved: false, issues: ["duplicate fact"] })
      .mockResolvedValueOnce({ approved: true, issues: [] });
    const avoidFacts = ["Honey never spoils.", "Bananas are berries."];

    await produceReviewedSpec({ ...opts, avoidFacts });

    expect(vi.mocked(requestGenerationSpec).mock.calls[0][0]).toMatchObject({
      avoidFacts,
    });
    expect(vi.mocked(requestGenerationSpec).mock.calls[1][0]).toMatchObject({
      avoidFacts,
    });
    expect(vi.mocked(evaluateSpec).mock.calls[0][0]).toMatchObject({
      avoidFacts,
    });
    expect(vi.mocked(evaluateSpec).mock.calls[1][0]).toMatchObject({
      avoidFacts,
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

  it("retries a validation failure with the error fed back as feedback", async () => {
    const error = new SpecValidationError(
      "generation spec: image_query is 4 words (max 3)",
    );
    vi.mocked(requestGenerationSpec)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(spec);
    vi.mocked(evaluateSpec).mockResolvedValue({ approved: true, issues: [] });
    const onInvalid = vi.fn();

    const result = await produceReviewedSpec({ ...opts, onInvalid });

    expect(result.attempts).toBe(2);
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(onInvalid).toHaveBeenCalledWith({ attempt: 1, error });
    // The invalid round never reaches the evaluator.
    expect(evaluateSpec).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestGenerationSpec).mock.calls[1][0]).toMatchObject({
      feedback: [
        "Your previous reply was invalid and was rejected before review: generation spec: image_query is 4 words (max 3). Reply again with ONE corrected JSON object.",
      ],
    });
  });

  it("throws once attempts are exhausted by validation failures", async () => {
    vi.mocked(requestGenerationSpec).mockRejectedValue(
      new SpecValidationError("generation spec: hook is 99 chars (max 70)"),
    );

    await expect(
      produceReviewedSpec({ ...opts, maxAttempts: 2 }),
    ).rejects.toThrow(/rejected after 2 attempts: .*hook is 99 chars/);
    expect(requestGenerationSpec).toHaveBeenCalledTimes(2);
    expect(evaluateSpec).not.toHaveBeenCalled();
  });

  it("rethrows non-validation errors immediately without retrying", async () => {
    vi.mocked(requestGenerationSpec).mockRejectedValue(
      new Error("claude exited with code 1: boom"),
    );
    const onInvalid = vi.fn();

    await expect(produceReviewedSpec({ ...opts, onInvalid })).rejects.toThrow(
      /claude exited with code 1/,
    );
    expect(requestGenerationSpec).toHaveBeenCalledTimes(1);
    expect(onInvalid).not.toHaveBeenCalled();
  });
});
