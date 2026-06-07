// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  buildPrompt,
  parseGenerationSpec,
  requestGenerationSpec,
  MAX_FACT_LENGTH,
} from "./generationSpec.ts";

const MUSIC = ["carefree", "inspired", "wholesome"];

const validSpec = {
  topic: "Marine biology",
  fact_text: "Octopuses have three hearts and blue blood.",
  image_prompt: "A deep blue ocean with an octopus",
  music: "carefree",
};

describe("buildPrompt", () => {
  it("lists the avoid topics and music ids", () => {
    const prompt = buildPrompt(["space", "history"], MUSIC);
    expect(prompt).toContain("space, history");
    expect(prompt).toContain("carefree, inspired, wholesome");
    expect(prompt).toContain(String(MAX_FACT_LENGTH));
  });

  it("handles an empty avoid list", () => {
    expect(buildPrompt([], MUSIC)).toContain("no recently-used topics");
  });
});

describe("parseGenerationSpec", () => {
  it("parses a clean JSON object", () => {
    expect(parseGenerationSpec(JSON.stringify(validSpec), MUSIC)).toEqual(
      validSpec,
    );
  });

  it("extracts JSON wrapped in code fences and prose", () => {
    const raw = "Here you go:\n```json\n" + JSON.stringify(validSpec) + "\n```";
    expect(parseGenerationSpec(raw, MUSIC)).toEqual(validSpec);
  });

  it("strips a .mp3 extension from the music id", () => {
    const raw = JSON.stringify({ ...validSpec, music: "carefree.mp3" });
    expect(parseGenerationSpec(raw, MUSIC).music).toBe("carefree");
  });

  it("rejects a fact longer than the max length", () => {
    const raw = JSON.stringify({ ...validSpec, fact_text: "x".repeat(161) });
    expect(() => parseGenerationSpec(raw, MUSIC)).toThrow(/max 160/);
  });

  it("rejects an unknown music id", () => {
    const raw = JSON.stringify({ ...validSpec, music: "techno" });
    expect(() => parseGenerationSpec(raw, MUSIC)).toThrow(/not one of/);
  });

  it("rejects a missing field", () => {
    const raw = JSON.stringify({ ...validSpec, topic: "" });
    expect(() => parseGenerationSpec(raw, MUSIC)).toThrow(/topic/);
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseGenerationSpec("nothing here", MUSIC)).toThrow(
      /no JSON object/,
    );
  });
});

describe("requestGenerationSpec", () => {
  it("unwraps the --output-format json envelope and validates", async () => {
    const run = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ result: JSON.stringify(validSpec) }));

    const spec = await requestGenerationSpec({
      avoidTopics: ["space"],
      validMusicIds: MUSIC,
      run,
    });

    expect(spec).toEqual(validSpec);
    expect(run).toHaveBeenCalledWith("claude", [
      "-p",
      expect.stringContaining("space"),
      "--output-format",
      "json",
    ]);
  });

  it("falls back to parsing raw output when not an envelope", async () => {
    const run = vi.fn().mockResolvedValue(JSON.stringify(validSpec));
    const spec = await requestGenerationSpec({
      avoidTopics: [],
      validMusicIds: MUSIC,
      run,
    });
    expect(spec).toEqual(validSpec);
  });
});
