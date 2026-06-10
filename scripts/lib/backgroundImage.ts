// Background image via Pexels (free, keyword-searchable stock photos).
// Gradient fallback ensures a failed fetch never blocks the pipeline.

import sharp from "sharp";
import { WIDTH, HEIGHT } from "./textOverlay.ts";
import {
  type Candidate,
  type ImageEvalContext,
  evaluateImageCandidates,
} from "./imageEvaluator.ts";

const PEXELS_SEARCH = "https://api.pexels.com/v1/search";

/** A solid-to-dark vertical gradient PNG used when the fetch fails. */
export function gradientFallback(): Promise<Buffer> {
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export type FetchBackgroundOptions = {
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  /** Pexels API key; defaults to PEXELS_API_KEY env var. */
  apiKey?: string;
};

export type BackgroundResult = {
  buffer: Buffer;
  /** True when the gradient fallback was used instead of a real image. */
  usedFallback: boolean;
};

/** A Pexels photo with the fields used for selection and download. */
type PexelsPhoto = {
  id: number;
  alt?: string;
  avg_color?: string;
  photographer?: string;
  src: { portrait: string };
};

/**
 * Run `fn` (passing it an abort signal) up to `retries` times, aborting each
 * attempt after `timeoutMs` and backing off exponentially between attempts.
 * Rethrows the last error once all retries are exhausted.
 */
async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  retries: number,
  timeoutMs: number,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fn(controller.signal);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Search Pexels for portrait photos matching `prompt`. */
async function searchPexels(
  prompt: string,
  perPage: number,
  fetchImpl: typeof fetch,
  apiKey: string,
  signal: AbortSignal,
): Promise<PexelsPhoto[]> {
  const searchUrl = `${PEXELS_SEARCH}?query=${encodeURIComponent(prompt)}&orientation=portrait&per_page=${perPage}`;
  const searchRes = await fetchImpl(searchUrl, {
    signal,
    headers: { Authorization: apiKey },
  });
  if (!searchRes.ok)
    throw new Error(`Pexels search responded ${searchRes.status}`);

  const json = (await searchRes.json()) as { photos?: PexelsPhoto[] };
  if (!json.photos?.length) throw new Error("Pexels returned no photos");
  return json.photos;
}

/** Download a photo URL and resize it to the frame dimensions as a PNG. */
async function downloadAndResize(
  url: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Buffer> {
  const imgRes = await fetchImpl(url, { signal });
  if (!imgRes.ok)
    throw new Error(`Pexels photo download responded ${imgRes.status}`);

  const raw = Buffer.from(await imgRes.arrayBuffer());
  return sharp(raw).resize(WIDTH, HEIGHT, { fit: "cover" }).png().toBuffer();
}

/**
 * Search Pexels for a portrait photo matching `prompt`, download it, and
 * resize to the frame dimensions. Retries up to `retries` times with
 * exponential backoff. Falls back to the gradient on any unrecoverable error.
 */
export async function fetchBackground(
  prompt: string,
  {
    fetchImpl = fetch,
    timeoutMs = 30_000,
    retries = 3,
    apiKey = process.env.PEXELS_API_KEY,
  }: FetchBackgroundOptions = {},
): Promise<BackgroundResult> {
  if (!apiKey) {
    console.warn("PEXELS_API_KEY not set; using gradient fallback");
    return { buffer: await gradientFallback(), usedFallback: true };
  }

  try {
    const buffer = await withRetry(
      async (signal) => {
        const photos = await searchPexels(prompt, 1, fetchImpl, apiKey, signal);
        return downloadAndResize(photos[0].src.portrait, fetchImpl, signal);
      },
      retries,
      timeoutMs,
    );
    return { buffer, usedFallback: false };
  } catch {
    return { buffer: await gradientFallback(), usedFallback: true };
  }
}

/** How many distinct candidate photos to fetch and evaluate. */
export const CANDIDATE_COUNT = 3;

export type FetchBestBackgroundOptions = FetchBackgroundOptions & {
  /** Number of distinct candidates to fetch and evaluate (default 3). */
  candidates?: number;
  /** Injectable evaluator for tests; defaults to the live Claude judge. */
  evaluate?: typeof evaluateImageCandidates;
  /** Invoked when the judge throws, so callers can log it instead of the
   *  failure silently defaulting to candidate 0. */
  onJudgeError?: (err: unknown) => void | Promise<void>;
};

export type BestBackgroundResult = BackgroundResult & {
  /** Index of the chosen candidate; undefined when the gradient was used. */
  chosenIndex?: number;
  /** The judge's reasons for the chosen candidate. */
  reasons?: string[];
  /** True when the judge threw and candidate 0 was used as the fallback. */
  judgeFailed?: boolean;
};

/**
 * Fetch several distinct Pexels candidates in parallel, ask the image judge
 * which best matches the spec, and return that one. Falls back to the gradient
 * if the key is missing or every candidate download fails; defaults to the
 * first candidate if the judge call fails. Never blocks the pipeline.
 */
export async function fetchBestBackground(
  ctx: ImageEvalContext,
  {
    fetchImpl = fetch,
    timeoutMs = 30_000,
    retries = 3,
    apiKey = process.env.PEXELS_API_KEY,
    candidates = CANDIDATE_COUNT,
    evaluate = evaluateImageCandidates,
    onJudgeError,
  }: FetchBestBackgroundOptions = {},
): Promise<BestBackgroundResult> {
  if (!apiKey) {
    console.warn("PEXELS_API_KEY not set; using gradient fallback");
    return { buffer: await gradientFallback(), usedFallback: true };
  }

  let photos: PexelsPhoto[];
  try {
    photos = await withRetry(
      (signal) => searchPexels(ctx.image_query, 30, fetchImpl, apiKey, signal),
      retries,
      timeoutMs,
    );
  } catch {
    return { buffer: await gradientFallback(), usedFallback: true };
  }

  // Take the first N photos with distinct ids to guarantee variety.
  const distinct: PexelsPhoto[] = [];
  const seen = new Set<number>();
  for (const photo of photos) {
    if (seen.has(photo.id)) continue;
    seen.add(photo.id);
    distinct.push(photo);
    if (distinct.length === candidates) break;
  }

  // Download the chosen photos in parallel, dropping any that fail.
  const downloads = await Promise.allSettled(
    distinct.map((photo) =>
      withRetry(
        (signal) => downloadAndResize(photo.src.portrait, fetchImpl, signal),
        retries,
        timeoutMs,
      ),
    ),
  );
  const available = distinct
    .map((photo, i) => ({ photo, result: downloads[i] }))
    .filter(
      (
        d,
      ): d is { photo: PexelsPhoto; result: PromiseFulfilledResult<Buffer> } =>
        d.result.status === "fulfilled",
    )
    .map(({ photo, result }) => ({ photo, buffer: result.value }));

  if (available.length === 0) {
    return { buffer: await gradientFallback(), usedFallback: true };
  }
  // A single candidate needs no judging.
  if (available.length === 1) {
    return { buffer: available[0].buffer, usedFallback: false, chosenIndex: 0 };
  }

  const candidateMeta: Candidate[] = available.map(({ photo }) => ({
    id: photo.id,
    alt: photo.alt ?? "",
    avgColor: photo.avg_color ?? "",
    photographer: photo.photographer ?? "",
  }));

  let choice = { bestIndex: 0, reasons: [] as string[] };
  let judgeFailed = false;
  try {
    choice = await evaluate({
      ctx,
      candidates: candidateMeta,
      images: available.map((a) => a.buffer),
    });
  } catch (err) {
    // Judge failed; keep the first candidate so the pipeline never blocks, but
    // surface the error so a crashed judge is not mistaken for a working one.
    judgeFailed = true;
    console.error("image judge failed; defaulting to candidate 0:", err);
    await onJudgeError?.(err);
  }

  return {
    buffer: available[choice.bestIndex].buffer,
    usedFallback: false,
    chosenIndex: choice.bestIndex,
    reasons: choice.reasons,
    judgeFailed,
  };
}
