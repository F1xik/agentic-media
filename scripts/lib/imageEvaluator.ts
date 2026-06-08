// Image-selection judge: a `claude` call that ranks several candidate stock
// background photos against the generation spec and picks the best match. It
// judges on the photos' metadata (alt text, average colour, photographer) — no
// vision — so the pipeline can avoid an off-topic or low-contrast background
// instead of blindly using the first Pexels hit.

import {
  type CommandRunner,
  defaultRunner,
  extractJsonObject,
} from "./generationSpec.ts";

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
  image_prompt: string;
  topic: string;
  fact_text: string;
};

/** The judge's choice: the index of the best candidate plus its reasoning. */
export type ImageChoice = { bestIndex: number; reasons: string[] };

/** Build the prompt that asks Claude to rank the candidate photos. */
export function buildImageEvalPrompt(
  ctx: ImageEvalContext,
  candidates: Candidate[],
): string {
  const list = candidates
    .map(
      (c, i) =>
        `${i}: alt=${JSON.stringify(c.alt)}, avg_color=${c.avgColor}, photographer=${JSON.stringify(c.photographer)}`,
    )
    .join("\n");

  return [
    "You are selecting the best stock background photo for a faceless YouTube Shorts fun-fact video.",
    "The video shows a single fun fact as text overlaid on a vertical background image.",
    "Pick the candidate whose photo best satisfies ALL of these:",
    `1. Visually matches the intended background: ${ctx.image_prompt}`,
    `2. Fits the topic "${ctx.topic}" and complements the fact: ${ctx.fact_text}`,
    "3. Reads well as a vertical background with text overlaid — favour uncluttered scenes with good contrast for legible text (avg_color hints at how dark or light the photo is).",
    "Candidates (0-indexed), described by their metadata:",
    list,
    "Respond with ONE JSON object and nothing else (no prose, no code fences).",
    'Schema: {"bestIndex": number, "reasons": string[]}',
    "bestIndex is the 0-based index of the best candidate. Give one concise reason string per key factor in your choice.",
  ].join("\n");
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
  /** Injectable runner for tests; defaults to spawning the `claude` CLI. */
  run?: CommandRunner;
};

/**
 * Ask Claude to pick the best candidate via `claude -p … --output-format json`,
 * unwrap the JSON result envelope, then validate the embedded choice. Throws on
 * malformed output; callers default to the first candidate on failure.
 */
export async function evaluateImageCandidates({
  ctx,
  candidates,
  run = defaultRunner,
}: EvaluateImageOptions): Promise<ImageChoice> {
  const prompt = buildImageEvalPrompt(ctx, candidates);
  const stdout = await run("claude", [
    "-p",
    prompt,
    "--model",
    IMAGE_EVAL_MODEL,
    "--effort",
    IMAGE_EVAL_EFFORT,
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
}
