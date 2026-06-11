// Grounded trending-topic picker: one `claude` call that uses the CLI's
// WebSearch tool to find a subject area that is genuinely trending *right now*,
// so fact generation can be anchored to what audiences currently care about
// instead of drifting (the channel skews heavily toward animals).
//
// Why web search: the model's training data goes stale, but the channel runs
// continuously on a schedule, so a plain knowledge-only call would just guess
// outdated trends. Grounding the pick with live search keeps it current.
//
// This is deliberately a single, cheap call with no retry loop, and it
// NEVER throws: on any failure (web unavailable, non-zero exit, malformed
// output) it returns `null` so the caller falls back to the producer's normal
// free-choice behaviour — mirroring the Pexels → gradient degradation that
// never blocks the pipeline. The chosen topic is only a seed; the unchanged
// producer→evaluator loop still enforces factual accuracy/format/engagement.

import {
  type CommandRunner,
  buildClaudeArgs,
  defaultRunner,
  extractJsonObject,
  unwrapResultEnvelope,
} from "./generationSpec.ts";

/** Picking a trend is a light web-grounded lookup, not creative writing, so use
 *  the cheaper Haiku 4.5: the producer→evaluator loop still enforces quality.
 *  Haiku doesn't accept `--effort`, so the call omits it. */
export const TRENDING_MODEL = "claude-haiku-4-5-20251001";

/** A trending subject area plus a short note on why it's trending. */
export type TrendingTopic = { topic: string; rationale?: string };

/**
 * Build the prompt that asks Claude to web-search for a currently-trending
 * subject area. It is framed as a durable *angle*, not breaking news, so the
 * producer can still find a surprising, verifiable, timeless fact about it.
 */
export function buildTrendingPrompt(avoidTopics: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const avoid =
    avoidTopics.length > 0
      ? `Avoid these recently-used topics: ${avoidTopics.join(", ")}.`
      : "There are no recently-used topics to avoid yet.";

  return [
    "You help script a faceless YouTube Shorts channel of surprising, true fun facts.",
    `Today is ${today}. Use web search to find what is genuinely trending and in the cultural conversation right now (news cycles, sports, entertainment, technology, seasonal moments, viral interests).`,
    "Pick ONE durable SUBJECT AREA or ANGLE connected to a current trend — something a surprising, verifiable, timeless fun fact can be found about.",
    "Do NOT pick breaking news, a fast-moving developing story, or anything hard to fact-check; the trend is only a hook into an evergreen fact.",
    `Keep the subject area to 2-4 words (e.g. "space exploration", "Olympic swimming", "electric cars"). ${avoid}`,
    "Respond with ONE JSON object and nothing else (no prose, no code fences).",
    'Schema: {"topic": string, "rationale": string}',
    "- topic: the 2-4 word subject area.",
    "- rationale: one short sentence on why it's trending right now.",
  ].join("\n");
}

/**
 * Parse and validate a trending topic from raw Claude text (tolerating prose or
 * code fences around the JSON). Throws on a missing/empty `topic`; `rationale`
 * is optional.
 */
export function parseTrendingTopic(raw: string): TrendingTopic {
  const obj = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;

  const topic = obj.topic;
  if (typeof topic !== "string" || topic.trim() === "") {
    throw new Error('trending topic: "topic" must be a non-empty string');
  }

  const rationale =
    typeof obj.rationale === "string" && obj.rationale.trim() !== ""
      ? obj.rationale.trim()
      : undefined;

  return { topic: topic.trim(), rationale };
}

export type PickTrendingOptions = {
  avoidTopics: string[];
  /** Injectable runner for tests; defaults to spawning the `claude` CLI. */
  run?: CommandRunner;
};

/**
 * Ask Claude for a currently-trending subject area via
 * `claude -p … --allowedTools WebSearch --output-format json`, unwrap the JSON
 * result envelope, and validate the embedded topic. Returns `null` on ANY
 * failure so the caller can fall back to the producer's free-choice behaviour —
 * this function never throws.
 */
export async function pickTrendingTopic({
  avoidTopics,
  run = defaultRunner,
}: PickTrendingOptions): Promise<TrendingTopic | null> {
  try {
    const prompt = buildTrendingPrompt(avoidTopics);
    const stdout = await run(
      "claude",
      buildClaudeArgs({
        prompt,
        model: TRENDING_MODEL,
        allowedTools: "WebSearch",
      }),
    );

    return parseTrendingTopic(unwrapResultEnvelope(stdout));
  } catch {
    // Web unavailable, non-zero exit, or malformed output — degrade gracefully.
    return null;
  }
}
