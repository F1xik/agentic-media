// Background image via Pexels (free, keyword-searchable stock photos).
// Gradient fallback ensures a failed fetch never blocks the pipeline.

import sharp from "sharp";
import { WIDTH, HEIGHT } from "./textOverlay.ts";

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

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // 1. Search Pexels for a portrait photo matching the prompt.
      const searchUrl = `${PEXELS_SEARCH}?query=${encodeURIComponent(prompt)}&orientation=portrait&per_page=1`;
      const searchRes = await fetchImpl(searchUrl, {
        signal: controller.signal,
        headers: { Authorization: apiKey },
      });
      if (!searchRes.ok)
        throw new Error(`Pexels search responded ${searchRes.status}`);

      const json = (await searchRes.json()) as {
        photos: { src: { portrait: string } }[];
      };
      if (!json.photos?.length) throw new Error("Pexels returned no photos");

      // 2. Download the portrait-cropped image and resize to frame dimensions.
      const photoUrl = json.photos[0].src.portrait;
      const imgRes = await fetchImpl(photoUrl, { signal: controller.signal });
      if (!imgRes.ok)
        throw new Error(`Pexels photo download responded ${imgRes.status}`);

      const raw = Buffer.from(await imgRes.arrayBuffer());
      const buffer = await sharp(raw)
        .resize(WIDTH, HEIGHT, { fit: "cover" })
        .png()
        .toBuffer();

      return { buffer, usedFallback: false };
    } catch {
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  return { buffer: await gradientFallback(), usedFallback: true };
}
