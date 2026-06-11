// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  buildTrendingPrompt,
  parseTrendingTopic,
  pickTrendingTopic,
  TRENDING_MODEL,
} from "./trendingTopic.ts";
import { MINIMAL_SYSTEM_PROMPT } from "./generationSpec.ts";

describe("model selection", () => {
  it("picks trends with the cheaper Haiku 4.5", () => {
    expect(TRENDING_MODEL).toBe("claude-haiku-4-5-20251001");
  });
});

describe("buildTrendingPrompt", () => {
  it("instructs the model to web-search for a current, durable trend", () => {
    const prompt = buildTrendingPrompt([]);
    expect(prompt.toLowerCase()).toContain("web search");
    expect(prompt.toLowerCase()).toContain("trending");
    // Framed as an evergreen subject area, not breaking news.
    expect(prompt).toContain("SUBJECT AREA");
    expect(prompt).toContain("evergreen");
    expect(prompt.toLowerCase()).toContain("verifiable");
    expect(prompt.toLowerCase()).toContain("not pick breaking news");
    expect(prompt).toContain("2-4 words");
  });

  it("asks for a JSON-only object with the topic/rationale schema", () => {
    const prompt = buildTrendingPrompt([]);
    expect(prompt).toContain("ONE JSON object");
    expect(prompt).toContain("no prose, no code fences");
    expect(prompt).toContain('{"topic": string, "rationale": string}');
  });

  it("lists the avoid topics, with a fallback when empty", () => {
    expect(buildTrendingPrompt(["space", "history"])).toContain(
      "space, history",
    );
    expect(buildTrendingPrompt([])).toContain("no recently-used topics");
  });

  it("embeds today's date for grounding", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(buildTrendingPrompt([])).toContain(today);
  });
});

describe("parseTrendingTopic", () => {
  it("parses a clean JSON object", () => {
    const raw = JSON.stringify({
      topic: "space exploration",
      rationale: "a new rover just landed",
    });
    expect(parseTrendingTopic(raw)).toEqual({
      topic: "space exploration",
      rationale: "a new rover just landed",
    });
  });

  it("extracts JSON wrapped in code fences and prose", () => {
    const raw =
      "Sure:\n```json\n" + JSON.stringify({ topic: "electric cars" }) + "\n```";
    expect(parseTrendingTopic(raw)).toEqual({
      topic: "electric cars",
      rationale: undefined,
    });
  });

  it("rejects a missing or empty topic", () => {
    expect(() => parseTrendingTopic(JSON.stringify({ topic: "" }))).toThrow(
      /topic/,
    );
    expect(() =>
      parseTrendingTopic(JSON.stringify({ rationale: "x" })),
    ).toThrow(/topic/);
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseTrendingTopic("nothing here")).toThrow(/no JSON object/);
  });
});

describe("pickTrendingTopic", () => {
  it("allows WebSearch and unwraps the json envelope", async () => {
    const topic = { topic: "Olympic swimming", rationale: "the games are on" };
    const run = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ result: JSON.stringify(topic) }));

    const result = await pickTrendingTopic({ avoidTopics: ["space"], run });

    expect(result).toEqual(topic);
    expect(run).toHaveBeenCalledWith("claude", [
      "-p",
      expect.stringContaining("space"),
      "--bare",
      "--system-prompt",
      MINIMAL_SYSTEM_PROMPT,
      "--model",
      "claude-haiku-4-5-20251001",
      "--allowedTools",
      "WebSearch",
      "--output-format",
      "json",
    ]);
  });

  it("falls back to parsing raw output when not an envelope", async () => {
    const run = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ topic: "electric cars" }));
    const result = await pickTrendingTopic({ avoidTopics: [], run });
    expect(result).toEqual({ topic: "electric cars", rationale: undefined });
  });

  it("returns null (never throws) when the claude call rejects", async () => {
    const run = vi.fn().mockRejectedValue(new Error("web unavailable"));
    await expect(
      pickTrendingTopic({ avoidTopics: [], run }),
    ).resolves.toBeNull();
  });

  it("returns null on malformed output", async () => {
    const run = vi.fn().mockResolvedValue("not json at all");
    await expect(
      pickTrendingTopic({ avoidTopics: [], run }),
    ).resolves.toBeNull();
  });

  it("returns null when the topic is empty", async () => {
    const run = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ result: JSON.stringify({ topic: "" }) }),
      );
    await expect(
      pickTrendingTopic({ avoidTopics: [], run }),
    ).resolves.toBeNull();
  });
});
