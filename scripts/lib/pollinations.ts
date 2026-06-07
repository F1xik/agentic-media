// Fetch a background image from Pollinations (keyless/free), with a gradient
// fallback so a failed/slow fetch never blocks the render pipeline.

import sharp from "sharp";
import { WIDTH, HEIGHT } from "./textOverlay.ts";

/** Build the Pollinations image URL for a prompt at portrait Shorts size. */
export function pollinationsUrl(prompt: string): string {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=${WIDTH}&height=${HEIGHT}&nologo=true`;
}

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
};

export type BackgroundResult = {
  buffer: Buffer;
  /** True when the gradient fallback was used instead of a real image. */
  usedFallback: boolean;
};

/**
 * Fetch the Pollinations image for `prompt`. Retries up to `retries` times
 * before falling back to the gradient. On any unrecoverable error resolves
 * with `usedFallback: true`.
 */
export async function fetchBackground(
  prompt: string,
  {
    fetchImpl = fetch,
    timeoutMs = 90_000,
    retries = 3,
  }: FetchBackgroundOptions = {},
): Promise<BackgroundResult> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(pollinationsUrl(prompt), {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Pollinations responded ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      return { buffer, usedFallback: false };
    } catch {
      if (attempt === retries) break;
      // Brief pause before retry so Pollinations isn't hammered.
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  return { buffer: await gradientFallback(), usedFallback: true };
}
