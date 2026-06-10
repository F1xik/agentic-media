// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  SpecValidationError,
  buildPrompt,
  parseGenerationSpec,
  requestGenerationSpec,
  MAX_FACT_LENGTH,
  MAX_HOOK_LENGTH,
} from "./generationSpec.ts";

const MUSIC = ["carefree", "inspired", "wholesome"];

const validSpec = {
  topic: "Marine biology",
  hook: "How many hearts does an octopus have?",
  fact_text: "Octopuses have three hearts and blue blood.",
  image_query: "octopus",
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

  it("encodes every quality constraint", () => {
    const prompt = buildPrompt([], MUSIC);
    expect(prompt).toContain("ONE JSON object");
    expect(prompt).toContain("no prose, no code fences");
    expect(prompt).toContain("2-4 words");
    expect(prompt).toContain("No hashtags");
    expect(prompt).toContain("no text in the image");
    expect(prompt).toContain("image_query");
    expect(prompt).toContain("concrete nouns");
    expect(prompt).toContain("HARD LIMIT: 3 words maximum");
    expect(prompt).toContain("surprising, verifiable, well-known");
    expect(prompt).toContain("curiosity-gap");
    expect(prompt).toContain(String(MAX_HOOK_LENGTH));
  });

  it("anchors the fact around a trending topic when one is given", () => {
    const prompt = buildPrompt([], MUSIC, [], "Olympic swimming");
    expect(prompt).toContain("Olympic swimming");
    expect(prompt).toContain("Anchor this around the currently-trending");
  });

  it("omits the anchor line when no trending topic is given", () => {
    expect(buildPrompt([], MUSIC)).not.toContain(
      "Anchor this around the currently-trending",
    );
  });

  it("builds the fact around a user-requested topic when one is given", () => {
    const prompt = buildPrompt([], MUSIC, [], undefined, "deep sea creatures");
    expect(prompt).toContain("deep sea creatures");
    expect(prompt).toContain("The user has specifically requested");
  });

  it("lets a requested topic take precedence over a trending one", () => {
    const prompt = buildPrompt(
      [],
      MUSIC,
      [],
      "Olympic swimming",
      "deep sea creatures",
    );
    expect(prompt).toContain("The user has specifically requested");
    expect(prompt).toContain("deep sea creatures");
    expect(prompt).not.toContain("Anchor this around the currently-trending");
    expect(prompt).not.toContain("Olympic swimming");
  });

  it("appends evaluator feedback when provided", () => {
    const prompt = buildPrompt(["space"], MUSIC, [
      "fact is not surprising",
      "topic has too many words",
    ]);
    expect(prompt).toContain("A previous attempt was rejected by the editor");
    expect(prompt).toContain("- fact is not surprising");
    expect(prompt).toContain("- topic has too many words");
  });

  it("omits the feedback block when there is no feedback", () => {
    expect(buildPrompt(["space"], MUSIC)).not.toContain(
      "A previous attempt was rejected",
    );
    expect(buildPrompt(["space"], MUSIC, [])).not.toContain(
      "A previous attempt was rejected",
    );
  });

  it("lists the recently-used facts to avoid when provided", () => {
    const prompt = buildPrompt([], MUSIC, [], undefined, undefined, [
      "Octopuses have three hearts.",
      "Honey never spoils.",
    ]);
    expect(prompt).toContain("Your fact must be NEW");
    expect(prompt).toContain("- Octopuses have three hearts.");
    expect(prompt).toContain("- Honey never spoils.");
  });

  it("omits the avoid-facts block when no facts are provided", () => {
    expect(buildPrompt([], MUSIC)).not.toContain("Your fact must be NEW");
    expect(buildPrompt([], MUSIC, [], undefined, undefined, [])).not.toContain(
      "Your fact must be NEW",
    );
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

  it("rejects a hook longer than the max length", () => {
    const raw = JSON.stringify({
      ...validSpec,
      hook: "x".repeat(MAX_HOOK_LENGTH + 1),
    });
    expect(() => parseGenerationSpec(raw, MUSIC)).toThrow(/hook/);
  });

  it("rejects a missing hook", () => {
    const raw = JSON.stringify({ ...validSpec, hook: "" });
    expect(() => parseGenerationSpec(raw, MUSIC)).toThrow(/hook/);
  });

  it("rejects an image_query with more than three words", () => {
    const raw = JSON.stringify({
      ...validSpec,
      image_query: "a deep blue ocean with an octopus",
    });
    expect(() => parseGenerationSpec(raw, MUSIC)).toThrow(/image_query/);
    expect(() => parseGenerationSpec(raw, MUSIC)).toThrow(SpecValidationError);
  });

  it("rejects a missing image_query", () => {
    const raw = JSON.stringify({ ...validSpec, image_query: "" });
    expect(() => parseGenerationSpec(raw, MUSIC)).toThrow(/image_query/);
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
    expect(() => parseGenerationSpec("nothing here", MUSIC)).toThrow(
      SpecValidationError,
    );
  });

  it("throws SpecValidationError on malformed JSON", () => {
    expect(() => parseGenerationSpec("{not valid json}", MUSIC)).toThrow(
      SpecValidationError,
    );
    expect(() => parseGenerationSpec("{not valid json}", MUSIC)).toThrow(
      /invalid JSON/,
    );
  });

  it("throws SpecValidationError for every field validation failure", () => {
    const cases = [
      { ...validSpec, fact_text: "x".repeat(MAX_FACT_LENGTH + 1) },
      { ...validSpec, hook: "x".repeat(MAX_HOOK_LENGTH + 1) },
      { ...validSpec, music: "techno" },
      { ...validSpec, topic: "" },
    ];
    for (const bad of cases) {
      expect(() => parseGenerationSpec(JSON.stringify(bad), MUSIC)).toThrow(
        SpecValidationError,
      );
    }
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
      "--model",
      "claude-sonnet-4-6",
      "--effort",
      "medium",
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

  it("forwards a trending topic into the prompt", async () => {
    const run = vi.fn().mockResolvedValue(JSON.stringify(validSpec));
    await requestGenerationSpec({
      avoidTopics: [],
      validMusicIds: MUSIC,
      trendingTopic: "Olympic swimming",
      run,
    });
    expect(run).toHaveBeenCalledWith("claude", [
      "-p",
      expect.stringContaining("Olympic swimming"),
      "--model",
      "claude-sonnet-4-6",
      "--effort",
      "medium",
      "--output-format",
      "json",
    ]);
  });

  it("forwards a requested topic into the prompt", async () => {
    const run = vi.fn().mockResolvedValue(JSON.stringify(validSpec));
    await requestGenerationSpec({
      avoidTopics: [],
      validMusicIds: MUSIC,
      requestedTopic: "deep sea creatures",
      run,
    });
    expect(run).toHaveBeenCalledWith("claude", [
      "-p",
      expect.stringContaining("deep sea creatures"),
      "--model",
      "claude-sonnet-4-6",
      "--effort",
      "medium",
      "--output-format",
      "json",
    ]);
    expect(run.mock.calls[0][1][1]).toContain("The user has specifically");
  });

  it("forwards evaluator feedback into the prompt", async () => {
    const run = vi.fn().mockResolvedValue(JSON.stringify(validSpec));
    await requestGenerationSpec({
      avoidTopics: [],
      validMusicIds: MUSIC,
      feedback: ["fact is not surprising"],
      run,
    });
    expect(run).toHaveBeenCalledWith("claude", [
      "-p",
      expect.stringContaining("fact is not surprising"),
      "--model",
      "claude-sonnet-4-6",
      "--effort",
      "medium",
      "--output-format",
      "json",
    ]);
  });

  it("forwards the facts to avoid into the prompt", async () => {
    const run = vi.fn().mockResolvedValue(JSON.stringify(validSpec));
    await requestGenerationSpec({
      avoidTopics: [],
      validMusicIds: MUSIC,
      avoidFacts: ["Honey never spoils."],
      run,
    });
    const prompt = run.mock.calls[0][1][1];
    expect(prompt).toContain("Your fact must be NEW");
    expect(prompt).toContain("- Honey never spoils.");
  });
});
