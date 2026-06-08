// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  buildGraderPrompt,
  parseGrade,
  gradeSpec,
  GRADER_MODEL,
} from "./factGrader.ts";

const spec = {
  topic: "Marine biology",
  fact_text: "Octopuses have three hearts and blue blood.",
  image_prompt: "A deep blue ocean with an octopus",
  music: "carefree",
};

describe("GRADER_MODEL", () => {
  it("grades with Sonnet 4.6", () => {
    expect(GRADER_MODEL).toBe("claude-sonnet-4-6");
  });
});

describe("buildGraderPrompt", () => {
  it("names every grading axis and embeds the spec", () => {
    const prompt = buildGraderPrompt(spec);
    expect(prompt).toContain("accuracy (1-5)");
    expect(prompt).toContain("engagement (1-5)");
    expect(prompt).toContain("imagePromptClean (boolean)");
    expect(prompt).toContain("Octopuses have three hearts");
  });

  it("asks for a JSON-only grade", () => {
    const prompt = buildGraderPrompt(spec);
    expect(prompt).toContain(
      '{"accuracy": number, "engagement": number, "imagePromptClean": boolean, "notes": string}',
    );
    expect(prompt).toContain("no prose, no code fences");
  });
});

describe("parseGrade", () => {
  it("parses a complete grade", () => {
    const raw = JSON.stringify({
      accuracy: 5,
      engagement: 4,
      imagePromptClean: true,
      notes: "solid",
    });
    expect(parseGrade(raw)).toEqual({
      accuracy: 5,
      engagement: 4,
      imagePromptClean: true,
      notes: "solid",
    });
  });

  it("extracts a grade wrapped in code fences and prose", () => {
    const raw =
      "Grade:\n```json\n" +
      JSON.stringify({
        accuracy: 2,
        engagement: 1,
        imagePromptClean: false,
        notes: "false claim",
      }) +
      "\n```";
    expect(parseGrade(raw)).toMatchObject({ accuracy: 2, engagement: 1 });
  });

  it("treats a missing or non-true imagePromptClean as false", () => {
    const raw = JSON.stringify({ accuracy: 5, engagement: 5 });
    expect(parseGrade(raw).imagePromptClean).toBe(false);
  });

  it("defaults notes to an empty string when absent", () => {
    const raw = JSON.stringify({
      accuracy: 5,
      engagement: 5,
      imagePromptClean: true,
    });
    expect(parseGrade(raw).notes).toBe("");
  });

  it("throws when a score is missing or not finite", () => {
    expect(() =>
      parseGrade(JSON.stringify({ engagement: 5, imagePromptClean: true })),
    ).toThrow(/accuracy/);
    expect(() =>
      parseGrade(JSON.stringify({ accuracy: "high", engagement: 5 })),
    ).toThrow(/accuracy/);
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseGrade("looks great")).toThrow(/no JSON object/);
  });
});

describe("gradeSpec", () => {
  it("unwraps the --output-format json envelope and validates", async () => {
    const grade = {
      accuracy: 5,
      engagement: 4,
      imagePromptClean: true,
      notes: "ok",
    };
    const run = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ result: JSON.stringify(grade) }));

    const result = await gradeSpec({ spec, run });

    expect(result).toEqual(grade);
    expect(run).toHaveBeenCalledWith("claude", [
      "-p",
      expect.stringContaining("Octopuses have three hearts"),
      "--model",
      "claude-sonnet-4-6",
      "--output-format",
      "json",
    ]);
  });

  it("falls back to parsing raw output when not an envelope", async () => {
    const run = vi.fn().mockResolvedValue(
      JSON.stringify({
        accuracy: 4,
        engagement: 4,
        imagePromptClean: true,
        notes: "",
      }),
    );
    const result = await gradeSpec({ spec, run });
    expect(result.accuracy).toBe(4);
  });
});
