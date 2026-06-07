// Obtain the per-video generation spec from Claude and validate its shape.
// generate.ts spawns the `claude` CLI; the prompt asks for a single JSON object
// describing the topic, fact, image prompt, and music track.

import { spawn } from "node:child_process";

export const MAX_FACT_LENGTH = 160;

/** Generation is the harder creative task; use the more capable Sonnet model. */
export const GENERATION_MODEL = "sonnet";

export type GenerationSpec = {
  topic: string;
  fact_text: string;
  image_prompt: string;
  /** Music track id (filename without `.mp3`); must be a committed track. */
  music: string;
};

/** A shell runner abstraction so the Claude call can be mocked in tests. */
export type CommandRunner = (cmd: string, args: string[]) => Promise<string>;

/**
 * Build the Claude prompt, biased away from recently-used topics. When a prior
 * attempt was rejected by the evaluator, its critique is passed as `feedback`
 * and appended so the next attempt can correct the flagged issues.
 */
export function buildPrompt(
  avoidTopics: string[],
  musicIds: string[],
  feedback: string[] = [],
): string {
  const avoid =
    avoidTopics.length > 0
      ? `Avoid these recently-used topics: ${avoidTopics.join(", ")}.`
      : "There are no recently-used topics to avoid yet.";

  const lines = [
    "You are scripting a faceless YouTube Shorts channel of surprising, true fun facts.",
    "Respond with ONE JSON object and nothing else (no prose, no code fences).",
    "Schema:",
    '{"topic": string, "fact_text": string, "image_prompt": string, "music": string}',
    `- topic: a short subject area (2-4 words). ${avoid}`,
    `- fact_text: ONE surprising, verifiable, well-known fact, at most ${MAX_FACT_LENGTH} characters. No hashtags.`,
    "- image_prompt: a vivid description for a vertical background image (no text in the image).",
    `- music: one of these track ids exactly: ${musicIds.join(", ")}.`,
  ];

  if (feedback.length > 0) {
    lines.push(
      "A previous attempt was rejected by the editor. Fix these issues:",
      ...feedback.map((issue) => `- ${issue}`),
    );
  }

  return lines.join("\n");
}

/** Spawn `claude`, capturing stdout (rejects on non-zero exit). */
export const defaultRunner: CommandRunner = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr}`));
    });
  });

/** Extract the first balanced `{…}` JSON object from arbitrary text. */
export function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("no JSON object found in Claude output");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error("unterminated JSON object in Claude output");
}

/**
 * Parse and validate a generation spec from raw Claude text (tolerating prose
 * or code fences around the JSON). Throws on any missing/invalid field.
 */
export function parseGenerationSpec(
  raw: string,
  validMusicIds: string[],
): GenerationSpec {
  const obj = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;

  const str = (key: keyof GenerationSpec): string => {
    const value = obj[key];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`generation spec: "${key}" must be a non-empty string`);
    }
    return value.trim();
  };

  const topic = str("topic");
  const fact_text = str("fact_text");
  const image_prompt = str("image_prompt");
  const music = str("music").replace(/\.mp3$/i, "");

  if (fact_text.length > MAX_FACT_LENGTH) {
    throw new Error(
      `generation spec: fact_text is ${fact_text.length} chars (max ${MAX_FACT_LENGTH})`,
    );
  }
  if (!validMusicIds.includes(music)) {
    throw new Error(
      `generation spec: music "${music}" is not one of: ${validMusicIds.join(", ")}`,
    );
  }

  return { topic, fact_text, image_prompt, music };
}

export type RequestOptions = {
  avoidTopics: string[];
  validMusicIds: string[];
  /** Evaluator critique from a prior rejected attempt, fed back into the prompt. */
  feedback?: string[];
  /** Injectable runner for tests; defaults to spawning the `claude` CLI. */
  run?: CommandRunner;
};

/**
 * Ask Claude for a generation spec via `claude -p … --output-format json`,
 * unwrap the JSON result envelope, then validate the embedded spec.
 */
export async function requestGenerationSpec({
  avoidTopics,
  validMusicIds,
  feedback = [],
  run = defaultRunner,
}: RequestOptions): Promise<GenerationSpec> {
  const prompt = buildPrompt(avoidTopics, validMusicIds, feedback);
  const stdout = await run("claude", [
    "-p",
    prompt,
    "--model",
    GENERATION_MODEL,
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

  return parseGenerationSpec(result, validMusicIds);
}
