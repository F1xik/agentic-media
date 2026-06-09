// Image-selection judge: a `claude` call that ranks several candidate stock
// background photos against the generation spec and picks the best match. It
// looks at the actual photos (vision) — the candidate buffers are written to
// temp files and read via the CLI's `Read` tool — using the Pexels metadata
// (alt text, average colour) only as a supplementary hint. This lets the
// pipeline reject backgrounds where the subject is tiny/distant/cluttered
// instead of blindly trusting alt text or the first Pexels hit.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import {
  type CommandRunner,
  defaultRunner,
  extractJsonObject,
} from "./generationSpec.ts";

/** Thumbnail size the candidates are downscaled to before judging. The judge
 *  needs enough detail to assess framing/prominence, not full 1080×1920 — small
 *  thumbnails cut vision token cost substantially. */
const THUMB_WIDTH = 360;
const THUMB_HEIGHT = 640;

/** Selecting the best image is a judgement task; use Sonnet 4.6. */
export const IMAGE_EVAL_MODEL = "claude-sonnet-4-6";

/** Reasoning effort for the image judge. Sonnet 4.6 accepts low|medium|high. */
export const IMAGE_EVAL_EFFORT = "medium";

/** Metadata for one candidate photo, drawn from the Pexels search result. */
export type Candidate = {
  id: number;
  alt: string;
  avgColor: string;
  photographer: string;
};

/** The spec fields the chosen image should match. */
export type ImageEvalContext = {
  /** Keyword search query used to fetch the candidates from Pexels. */
  image_query: string;
  image_prompt: string;
  topic: string;
  fact_text: string;
};

/** The judge's choice: the index of the best candidate plus its reasoning. */
export type ImageChoice = { bestIndex: number; reasons: string[] };

/** Build the prompt that asks Claude to look at and rank the candidate photos.
 *  `paths[i]` is the temp-file path of the image for `candidates[i]`. */
export function buildImageEvalPrompt(
  ctx: ImageEvalContext,
  candidates: Candidate[],
  paths: string[],
): string {
  const list = candidates
    .map(
      (c, i) =>
        `${i}: file=${paths[i]} (alt=${JSON.stringify(c.alt)}, avg_color=${c.avgColor})`,
    )
    .join("\n");

  return [
    "You are selecting the best stock background photo for a faceless YouTube Shorts fun-fact video.",
    "The video shows a single fun fact as text overlaid on a vertical background image.",
    "Read (open and look at) each candidate image file listed below before judging — base your choice on what the image actually shows, not just its metadata.",
    "Pick the candidate whose photo best satisfies ALL of these:",
    `1. Visually matches the intended background: ${ctx.image_prompt}`,
    `2. Fits the topic "${ctx.topic}" and complements the fact: ${ctx.fact_text}`,
    "3. The topic's main subject is clearly visible, prominent, and well-framed — REJECT photos where the subject is tiny, distant, aerial, cluttered, or hard to make out.",
    "4. Reads well as a vertical (9:16) background with text overlaid — favour uncluttered scenes with good contrast and room for a text overlay (avg_color hints at how dark or light the photo is).",
    "Candidates (0-indexed), each given as its image file path plus metadata hints:",
    list,
    "Respond with ONE JSON object and nothing else (no prose, no code fences).",
    'Schema: {"bestIndex": number, "reasons": string[]}',
    "bestIndex is the 0-based index of the best candidate. Give one concise reason string per key factor in your choice.",
  ].join("\n");
}

/**
 * Downscale each candidate buffer to a thumbnail and write it into a fresh temp
 * directory so the judge can read the actual pixels via the CLI's `Read` tool.
 * Returns the absolute file paths plus a `cleanup` that removes the directory.
 */
async function writeCandidateTempFiles(
  images: Buffer[],
): Promise<{ paths: string[]; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "imgjudge-"));
  const paths = await Promise.all(
    images.map(async (buf, i) => {
      const thumb = await sharp(buf)
        .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "inside" })
        .png()
        .toBuffer();
      const path = join(dir, `${i}.png`);
      await writeFile(path, thumb);
      return path;
    }),
  );
  return {
    paths,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/**
 * Parse and validate the judge's choice from raw Claude text (tolerating prose
 * or code fences). Clamps an out-of-range, negative, or non-integer `bestIndex`
 * to 0 so a malformed index can never select a non-existent candidate.
 */
export function parseImageChoice(
  raw: string,
  candidateCount: number,
): ImageChoice {
  const obj = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;

  const idx = obj.bestIndex;
  const bestIndex =
    typeof idx === "number" &&
    Number.isInteger(idx) &&
    idx >= 0 &&
    idx < candidateCount
      ? idx
      : 0;

  const reasons = Array.isArray(obj.reasons)
    ? obj.reasons.filter((r): r is string => typeof r === "string")
    : [];

  return { bestIndex, reasons };
}

export type EvaluateImageOptions = {
  ctx: ImageEvalContext;
  candidates: Candidate[];
  /** Candidate image buffers, index-aligned with `candidates`. */
  images: Buffer[];
  /** Injectable runner for tests; defaults to spawning the `claude` CLI. */
  run?: CommandRunner;
};

/**
 * Ask Claude to pick the best candidate by looking at the actual photos: write
 * the buffers to temp files, reference their paths in the prompt, and let the
 * CLI read them via the `Read` tool (`claude -p … --allowedTools Read
 * --output-format json`). Unwraps the JSON result envelope, then validates the
 * embedded choice. Temp files are always cleaned up. Throws on malformed output
 * or read failure; callers default to the first candidate on failure.
 */
export async function evaluateImageCandidates({
  ctx,
  candidates,
  images,
  run = defaultRunner,
}: EvaluateImageOptions): Promise<ImageChoice> {
  const { paths, cleanup } = await writeCandidateTempFiles(images);
  try {
    const prompt = buildImageEvalPrompt(ctx, candidates, paths);
    const stdout = await run("claude", [
      "-p",
      prompt,
      "--model",
      IMAGE_EVAL_MODEL,
      "--effort",
      IMAGE_EVAL_EFFORT,
      "--allowedTools",
      "Read",
      "--output-format",
      "json",
    ]);

    // `--output-format json` wraps the reply in an envelope: { result, ... }.
    let result = stdout;
    try {
      const envelope = JSON.parse(stdout) as { result?: unknown };
      if (typeof envelope.result === "string") result = envelope.result;
    } catch {
      // Not an envelope (e.g. mocked plain output); fall through to parse raw.
    }

    return parseImageChoice(result, candidates.length);
  } finally {
    await cleanup();
  }
}
