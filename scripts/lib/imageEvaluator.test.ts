// @vitest-environment node
import { existsSync } from "node:fs";
import { dirname } from "node:path";

import { describe, it, expect, vi } from "vitest";
import {
  buildImageEvalPrompt,
  parseImageChoice,
  evaluateImageCandidates,
  IMAGE_EVAL_MODEL,
  IMAGE_EVAL_EFFORT,
  type Candidate,
  type ImageEvalContext,
} from "./imageEvaluator.ts";

describe("model selection", () => {
  it("judges with Sonnet 4.6 at medium effort", () => {
    expect(IMAGE_EVAL_MODEL).toBe("claude-sonnet-4-6");
    expect(IMAGE_EVAL_EFFORT).toBe("medium");
  });
});

const ctx: ImageEvalContext = {
  image_query: "octopus",
  image_prompt: "A deep blue ocean with an octopus",
  topic: "Marine biology",
  fact_text: "Octopuses have three hearts and blue blood.",
};

const candidates: Candidate[] = [
  {
    id: 1,
    alt: "a coral reef teeming with fish",
    avgColor: "#1a3a5a",
    photographer: "Alice",
  },
  {
    id: 2,
    alt: "a lone octopus on the dark sea floor",
    avgColor: "#0a1a2a",
    photographer: "Bob",
  },
  {
    id: 3,
    alt: "a busy fish market stall",
    avgColor: "#aabbcc",
    photographer: "Carol",
  },
];

// Minimal valid 1×1 PNG — sharp can resize this into a thumbnail.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const images = [TINY_PNG, TINY_PNG, TINY_PNG];

const paths = ["/tmp/x/0.png", "/tmp/x/1.png", "/tmp/x/2.png"];

/** Pull the `-p` prompt string out of a captured `run` mock call. */
function promptArg(run: ReturnType<typeof vi.fn>): string {
  return run.mock.calls[0][1][1];
}

/** Pull the first candidate temp-file path out of a built prompt. */
function firstTempPath(prompt: string): string {
  const match = prompt.match(/0: file=(\S+\.png)/);
  if (!match) throw new Error(`no temp path in prompt: ${prompt}`);
  return match[1];
}

describe("buildImageEvalPrompt", () => {
  it("embeds the spec fields to match against", () => {
    const prompt = buildImageEvalPrompt(ctx, candidates, paths);
    expect(prompt).toContain("A deep blue ocean with an octopus");
    expect(prompt).toContain("Marine biology");
    expect(prompt).toContain("Octopuses have three hearts");
  });

  it("lists each candidate's image file path and alt hint, 0-indexed", () => {
    const prompt = buildImageEvalPrompt(ctx, candidates, paths);
    expect(prompt).toContain("0: file=/tmp/x/0.png");
    expect(prompt).toContain("alt=");
    expect(prompt).toContain("a lone octopus on the dark sea floor");
    expect(prompt).toContain("a busy fish market stall");
  });

  it("instructs the judge to look at the actual image files", () => {
    const prompt = buildImageEvalPrompt(ctx, candidates, paths);
    expect(prompt.toLowerCase()).toContain("read");
    expect(prompt.toLowerCase()).toContain("image file");
  });

  it("asks for a JSON-only choice", () => {
    const prompt = buildImageEvalPrompt(ctx, candidates, paths);
    expect(prompt).toContain('{"bestIndex": number, "reasons": string[]}');
    expect(prompt).toContain("no prose, no code fences");
  });
});

describe("parseImageChoice", () => {
  it("parses a valid choice", () => {
    const raw = JSON.stringify({ bestIndex: 1, reasons: ["best contrast"] });
    expect(parseImageChoice(raw, 3)).toEqual({
      bestIndex: 1,
      reasons: ["best contrast"],
    });
  });

  it("extracts a choice wrapped in code fences and prose", () => {
    const raw =
      "Choice:\n```json\n" +
      JSON.stringify({ bestIndex: 2, reasons: ["on topic"] }) +
      "\n```";
    expect(parseImageChoice(raw, 3)).toEqual({
      bestIndex: 2,
      reasons: ["on topic"],
    });
  });

  it("clamps an out-of-range, negative, or non-integer index to 0", () => {
    expect(
      parseImageChoice(JSON.stringify({ bestIndex: 9 }), 3).bestIndex,
    ).toBe(0);
    expect(
      parseImageChoice(JSON.stringify({ bestIndex: -1 }), 3).bestIndex,
    ).toBe(0);
    expect(
      parseImageChoice(JSON.stringify({ bestIndex: 1.5 }), 3).bestIndex,
    ).toBe(0);
    expect(
      parseImageChoice(JSON.stringify({ bestIndex: "two" }), 3).bestIndex,
    ).toBe(0);
  });

  it("defaults reasons to an empty array when missing or not an array", () => {
    expect(
      parseImageChoice(JSON.stringify({ bestIndex: 0 }), 3).reasons,
    ).toEqual([]);
    expect(
      parseImageChoice(JSON.stringify({ bestIndex: 0, reasons: "nope" }), 3)
        .reasons,
    ).toEqual([]);
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseImageChoice("the second one", 3)).toThrow(
      /no JSON object/,
    );
  });
});

describe("evaluateImageCandidates", () => {
  it("writes image temp files, allows Read, and unwraps the json envelope", async () => {
    const choice = { bestIndex: 1, reasons: ["best contrast"] };
    const run = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ result: JSON.stringify(choice) }));

    const result = await evaluateImageCandidates({
      ctx,
      candidates,
      images,
      run,
    });

    expect(result).toEqual(choice);
    expect(run).toHaveBeenCalledWith("claude", [
      "-p",
      expect.stringContaining("0: file="),
      "--model",
      "claude-sonnet-4-6",
      "--effort",
      "medium",
      "--allowedTools",
      "Read",
      "--output-format",
      "json",
    ]);
    // The prompt references one temp .png path per candidate.
    const prompt = promptArg(run);
    expect(prompt).toMatch(/0: file=\S+\.png/);
    expect(prompt).toMatch(/2: file=\S+\.png/);
  });

  it("falls back to parsing raw output when not an envelope", async () => {
    const run = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ bestIndex: 2, reasons: [] }));
    const result = await evaluateImageCandidates({
      ctx,
      candidates,
      images,
      run,
    });
    expect(result).toEqual({ bestIndex: 2, reasons: [] });
  });

  it("removes the temp files after a successful judge call", async () => {
    const run = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ bestIndex: 0, reasons: [] }));

    await evaluateImageCandidates({ ctx, candidates, images, run });

    const dir = dirname(firstTempPath(promptArg(run)));
    expect(existsSync(dir)).toBe(false);
  });

  it("removes the temp files even when the judge call rejects", async () => {
    const run = vi.fn().mockRejectedValue(new Error("claude down"));

    await expect(
      evaluateImageCandidates({ ctx, candidates, images, run }),
    ).rejects.toThrow("claude down");

    const dir = dirname(firstTempPath(promptArg(run)));
    expect(existsSync(dir)).toBe(false);
  });
});
