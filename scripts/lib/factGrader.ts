// Model-graded eval helper: an LLM-as-judge that scores a generated fact spec
// on the qualities the producer prompt is meant to deliver — factual accuracy,
// engagement, and a text-free image prompt. Used only by the eval suite
// (`scripts/evals/`), never by the production pipeline.

import {
  type CommandRunner,
  type GenerationSpec,
  defaultRunner,
  extractJsonObject,
} from "./generationSpec.ts";

/** Grading factual accuracy benefits from a stronger judge; use Sonnet 4.6. */
export const GRADER_MODEL = "claude-sonnet-4-6";

/** Per-axis judgement of a generated spec. Scores are 1 (worst) to 5 (best). */
export type Grade = {
  /** Is `fact_text` objectively true and verifiable? */
  accuracy: number;
  /** Is the fact surprising and hook-worthy for a short-form audience? */
  engagement: number;
  /** Does `image_prompt` avoid requesting embedded/overlaid text? */
  imagePromptClean: boolean;
  /** The judge's free-text rationale, surfaced in failing assertions. */
  notes: string;
};

/** Build the judge prompt that grades a generated spec on each quality axis. */
export function buildGraderPrompt(spec: GenerationSpec): string {
  return [
    "You are a meticulous fact-checker and short-form content critic.",
    "Grade the generated YouTube Shorts item below on each axis. Be strict and do not give the benefit of the doubt.",
    "- accuracy (1-5): is fact_text objectively TRUE and verifiable? 5 = unambiguously true, 1 = false or hallucinated.",
    "- engagement (1-5): is the fact genuinely surprising and hook-worthy, AND does hook open a real curiosity gap that sets up fact_text as the payoff? 5 = stops the scroll with a strong teaser, 1 = bland fact or a hook that is missing, weak, or just restates the answer.",
    "- imagePromptClean (boolean): true ONLY if image_prompt describes a visual scene with no request for embedded/overlaid text, words, letters, or captions.",
    "Respond with ONE JSON object and nothing else (no prose, no code fences).",
    'Schema: {"accuracy": number, "engagement": number, "imagePromptClean": boolean, "notes": string}',
    "Item to grade:",
    JSON.stringify(spec),
  ].join("\n");
}

/**
 * Parse and validate a grade from raw Claude text (tolerating prose or code
 * fences around the JSON). Throws when a numeric score is missing or invalid.
 */
export function parseGrade(raw: string): Grade {
  const obj = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;

  const num = (key: keyof Grade): number => {
    const value = obj[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`grade: "${key}" must be a finite number`);
    }
    return value;
  };

  return {
    accuracy: num("accuracy"),
    engagement: num("engagement"),
    imagePromptClean: obj.imagePromptClean === true,
    notes: typeof obj.notes === "string" ? obj.notes : "",
  };
}

export type GradeOptions = {
  spec: GenerationSpec;
  /** Injectable runner for tests; defaults to spawning the `claude` CLI. */
  run?: CommandRunner;
};

/**
 * Ask Claude to grade a generation spec via `claude -p … --output-format json`,
 * unwrap the JSON result envelope, then validate the embedded grade.
 */
export async function gradeSpec({
  spec,
  run = defaultRunner,
}: GradeOptions): Promise<Grade> {
  const prompt = buildGraderPrompt(spec);
  const stdout = await run("claude", [
    "-p",
    prompt,
    "--model",
    GRADER_MODEL,
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

  return parseGrade(result);
}
