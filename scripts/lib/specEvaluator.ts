// Producer/evaluator pattern: a second `claude` call acts as an LLM-as-judge
// that cross-checks a generated spec before it reaches review. It scores the
// text on factual accuracy, format/constraints, and engagement, returning a
// structured verdict whose issues feed back into the producer prompt on retry.

import {
  type CommandRunner,
  type GenerationSpec,
  MAX_FACT_LENGTH,
  MAX_HOOK_LENGTH,
  MAX_IMAGE_QUERY_WORDS,
  defaultRunner,
  extractJsonObject,
} from "./generationSpec.ts";

/** Evaluation is a fact-checking task; use Sonnet 4.6 for stronger judgement. */
export const EVALUATION_MODEL = "claude-sonnet-4-6";

/** Reasoning effort for the evaluator. Sonnet 4.6 accepts low|medium|high. */
export const EVALUATION_EFFORT = "medium";

/** The evaluator's structured judgement: approve, plus any blocking issues. */
export type Verdict = { approved: boolean; issues: string[] };

/** Build the editor/fact-checker prompt that judges a generated spec. */
export function buildEvaluatorPrompt(
  spec: GenerationSpec,
  musicIds: string[],
): string {
  return [
    "You are a strict editor and fact-checker for a faceless YouTube Shorts channel of surprising, true fun facts.",
    "Judge the generated item below against ALL of these criteria:",
    "1. Factual accuracy: fact_text must be true, verifiable, and not a hallucination or distortion.",
    `2. Format and constraints: topic is 2-4 words; hook is at most ${MAX_HOOK_LENGTH} characters with no hashtags; fact_text is at most ${MAX_FACT_LENGTH} characters with no hashtags; image_query is 1-${MAX_IMAGE_QUERY_WORDS} concrete nouns naming the subject (a stock-photo search term, not a sentence); image_prompt describes a vertical background image with no embedded text; music is one of: ${musicIds.join(", ")}.`,
    "3. Engagement: the fact is genuinely surprising and hook-worthy for a short-form audience, not bland or widely-known trivia; AND the hook is a real curiosity gap (a teaser or question that makes the viewer want the answer) that sets up fact_text as the payoff without restating it or giving the answer away.",
    "Respond with ONE JSON object and nothing else (no prose, no code fences).",
    'Schema: {"approved": boolean, "issues": string[]}',
    "Approve only if every criterion holds. Give one concise issue string per failing criterion; use an empty issues array when approved.",
    "Item to evaluate:",
    JSON.stringify(spec),
  ].join("\n");
}

/**
 * Parse and validate a verdict from raw Claude text (tolerating prose or code
 * fences around the JSON). Throws when `approved` is missing or not a boolean.
 */
export function parseVerdict(raw: string): Verdict {
  const obj = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;

  if (typeof obj.approved !== "boolean") {
    throw new Error('verdict: "approved" must be a boolean');
  }

  const issues = Array.isArray(obj.issues)
    ? obj.issues.filter((i): i is string => typeof i === "string")
    : [];

  return { approved: obj.approved, issues };
}

export type EvaluateOptions = {
  spec: GenerationSpec;
  validMusicIds: string[];
  /** Injectable runner for tests; defaults to spawning the `claude` CLI. */
  run?: CommandRunner;
};

/**
 * Ask Claude to evaluate a generation spec via `claude -p … --output-format
 * json`, unwrap the JSON result envelope, then validate the embedded verdict.
 */
export async function evaluateSpec({
  spec,
  validMusicIds,
  run = defaultRunner,
}: EvaluateOptions): Promise<Verdict> {
  const prompt = buildEvaluatorPrompt(spec, validMusicIds);
  const stdout = await run("claude", [
    "-p",
    prompt,
    "--model",
    EVALUATION_MODEL,
    "--effort",
    EVALUATION_EFFORT,
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

  return parseVerdict(result);
}
