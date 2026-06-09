// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  buildEvaluatorPrompt,
  parseVerdict,
  evaluateSpec,
  EVALUATION_MODEL,
  EVALUATION_EFFORT,
} from "./specEvaluator.ts";
import { MAX_FACT_LENGTH, GENERATION_MODEL } from "./generationSpec.ts";

describe("model selection", () => {
  it("evaluates and generates with Sonnet 4.6 at medium effort", () => {
    expect(EVALUATION_MODEL).toBe("claude-sonnet-4-6");
    expect(EVALUATION_EFFORT).toBe("medium");
    expect(GENERATION_MODEL).toBe("claude-sonnet-4-6");
  });
});

const MUSIC = ["carefree", "inspired", "wholesome"];

const spec = {
  topic: "Marine biology",
  hook: "How many hearts does an octopus have?",
  fact_text: "Octopuses have three hearts and blue blood.",
  image_query: "octopus",
  image_prompt: "A deep blue ocean with an octopus",
  music: "carefree",
};

describe("buildEvaluatorPrompt", () => {
  it("names all three evaluation criteria", () => {
    const prompt = buildEvaluatorPrompt(spec, MUSIC);
    expect(prompt).toContain("Factual accuracy");
    expect(prompt).toContain("Format and constraints");
    expect(prompt).toContain("Engagement");
    expect(prompt).toContain(String(MAX_FACT_LENGTH));
    expect(prompt).toContain("carefree, inspired, wholesome");
    expect(prompt).toContain("curiosity gap");
    expect(prompt).toContain("image_query");
  });

  it("embeds the spec fields to evaluate", () => {
    const prompt = buildEvaluatorPrompt(spec, MUSIC);
    expect(prompt).toContain("Octopuses have three hearts");
    expect(prompt).toContain("Marine biology");
  });

  it("asks for a JSON-only verdict", () => {
    const prompt = buildEvaluatorPrompt(spec, MUSIC);
    expect(prompt).toContain('{"approved": boolean, "issues": string[]}');
    expect(prompt).toContain("no prose, no code fences");
  });
});

describe("parseVerdict", () => {
  it("parses an approval with no issues", () => {
    expect(
      parseVerdict(JSON.stringify({ approved: true, issues: [] })),
    ).toEqual({ approved: true, issues: [] });
  });

  it("parses a rejection with issues", () => {
    const raw = JSON.stringify({
      approved: false,
      issues: ["fact is not surprising"],
    });
    expect(parseVerdict(raw)).toEqual({
      approved: false,
      issues: ["fact is not surprising"],
    });
  });

  it("extracts a verdict wrapped in code fences and prose", () => {
    const raw =
      "Verdict:\n```json\n" +
      JSON.stringify({ approved: false, issues: ["too long"] }) +
      "\n```";
    expect(parseVerdict(raw)).toEqual({
      approved: false,
      issues: ["too long"],
    });
  });

  it("defaults issues to an empty array when missing or not an array", () => {
    expect(parseVerdict(JSON.stringify({ approved: true })).issues).toEqual([]);
    expect(
      parseVerdict(JSON.stringify({ approved: true, issues: "nope" })).issues,
    ).toEqual([]);
  });

  it("throws when approved is missing or not a boolean", () => {
    expect(() => parseVerdict(JSON.stringify({ issues: [] }))).toThrow(
      /approved/,
    );
    expect(() =>
      parseVerdict(JSON.stringify({ approved: "yes", issues: [] })),
    ).toThrow(/approved/);
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseVerdict("looks good to me")).toThrow(/no JSON object/);
  });
});

describe("evaluateSpec", () => {
  it("unwraps the --output-format json envelope and validates", async () => {
    const verdict = { approved: false, issues: ["fact is not surprising"] };
    const run = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ result: JSON.stringify(verdict) }));

    const result = await evaluateSpec({ spec, validMusicIds: MUSIC, run });

    expect(result).toEqual(verdict);
    expect(run).toHaveBeenCalledWith("claude", [
      "-p",
      expect.stringContaining("Octopuses have three hearts"),
      "--model",
      "claude-sonnet-4-6",
      "--effort",
      "medium",
      "--output-format",
      "json",
    ]);
  });

  it("falls back to parsing raw output when not an envelope", async () => {
    const run = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ approved: true, issues: [] }));
    const result = await evaluateSpec({ spec, validMusicIds: MUSIC, run });
    expect(result).toEqual({ approved: true, issues: [] });
  });
});
