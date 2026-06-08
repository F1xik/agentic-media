// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  gradientFallback,
  fetchBackground,
  fetchBestBackground,
} from "./backgroundImage.ts";

const FAKE_KEY = "test-key";

// Minimal valid 1×1 RGB PNG — sharp can resize this to any dimensions.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Minimal Pexels search response with one portrait photo URL. */
function pexelsSearchResponse(portraitUrl: string) {
  return {
    ok: true,
    json: async () => ({
      photos: [{ src: { portrait: portraitUrl } }],
    }),
  };
}

/** A downloaded-photo response wrapping the tiny PNG. */
function photoDownloadResponse() {
  return {
    ok: true,
    arrayBuffer: async () => Uint8Array.from(TINY_PNG).buffer,
  };
}

/** Pexels search response with `ids.length` photos (ids may repeat). */
function pexelsSearchPhotos(ids: number[]) {
  return {
    ok: true,
    json: async () => ({
      photos: ids.map((id) => ({
        id,
        alt: `photo ${id}`,
        avg_color: "#123456",
        photographer: `Photographer ${id}`,
        src: { portrait: `https://example.com/${id}.jpg` },
      })),
    }),
  };
}

const CTX = {
  image_prompt: "a deep blue ocean",
  topic: "Marine biology",
  fact_text: "Octopuses have three hearts.",
};

describe("gradientFallback", () => {
  it("produces a PNG buffer at frame size", async () => {
    const buffer = await gradientFallback();
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});

describe("fetchBackground", () => {
  it("returns a PNG buffer on success", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        pexelsSearchResponse("https://example.com/photo.jpg"),
      )
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from(TINY_PNG).buffer,
      });

    const result = await fetchBackground("ocean", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: FAKE_KEY,
    });

    expect(result.usedFallback).toBe(false);
    expect(result.buffer.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // First call must include the Authorization header.
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: FAKE_KEY },
    });
  });

  it("uses gradient fallback when no API key is set", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchBackground("ocean", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: undefined,
    });
    expect(result.usedFallback).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back to gradient after all retries on a non-OK search response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    const result = await fetchBackground("ocean", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: FAKE_KEY,
      retries: 1,
    });
    expect(result.usedFallback).toBe(true);
    expect(result.buffer.subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("falls back to gradient after all retries when fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await fetchBackground("ocean", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: FAKE_KEY,
      retries: 1,
    });
    expect(result.usedFallback).toBe(true);
  });

  it("succeeds on a later retry after an initial failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(
        pexelsSearchResponse("https://example.com/photo.jpg"),
      )
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from(TINY_PNG).buffer,
      });

    const result = await fetchBackground("ocean", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: FAKE_KEY,
      retries: 2,
    });

    expect(result.usedFallback).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  }, 10_000); // allows for the 2s backoff between retries
});

describe("fetchBestBackground", () => {
  it("fetches distinct candidates and returns the judge's pick", async () => {
    // Search returns a duplicate id (1) which must be de-duplicated.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(pexelsSearchPhotos([1, 1, 2, 3, 4]))
      .mockResolvedValue(photoDownloadResponse());
    const evaluate = vi
      .fn()
      .mockResolvedValue({ bestIndex: 2, reasons: ["best contrast"] });

    const result = await fetchBestBackground(CTX, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: FAKE_KEY,
      evaluate,
    });

    expect(result.usedFallback).toBe(false);
    expect(result.chosenIndex).toBe(2);
    expect(result.reasons).toEqual(["best contrast"]);
    expect(result.buffer.subarray(0, 4).toString("hex")).toBe("89504e47");
    // 1 search + 3 distinct downloads.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    // The judge sees three distinct candidates (ids 1, 2, 3).
    const candidates = evaluate.mock.calls[0][0].candidates;
    expect(candidates.map((c: { id: number }) => c.id)).toEqual([1, 2, 3]);
  });

  it("defaults to the first candidate when the judge fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(pexelsSearchPhotos([1, 2, 3]))
      .mockResolvedValue(photoDownloadResponse());
    const evaluate = vi.fn().mockRejectedValue(new Error("claude down"));

    const result = await fetchBestBackground(CTX, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: FAKE_KEY,
      evaluate,
    });

    expect(result.usedFallback).toBe(false);
    expect(result.chosenIndex).toBe(0);
  });

  it("skips the judge when only one candidate downloads", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(pexelsSearchPhotos([1, 2, 3]))
      .mockResolvedValueOnce(photoDownloadResponse())
      .mockResolvedValue({ ok: false, status: 500 }); // the other two fail
    const evaluate = vi.fn();

    const result = await fetchBestBackground(CTX, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: FAKE_KEY,
      retries: 1,
      evaluate,
    });

    expect(result.usedFallback).toBe(false);
    expect(result.chosenIndex).toBe(0);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("uses the gradient fallback when no API key is set", async () => {
    const fetchImpl = vi.fn();
    const evaluate = vi.fn();
    const result = await fetchBestBackground(CTX, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: undefined,
      evaluate,
    });
    expect(result.usedFallback).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("falls back to the gradient when every download fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(pexelsSearchPhotos([1, 2, 3]))
      .mockResolvedValue({ ok: false, status: 500 });
    const evaluate = vi.fn();

    const result = await fetchBestBackground(CTX, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: FAKE_KEY,
      retries: 1,
      evaluate,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.buffer.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(evaluate).not.toHaveBeenCalled();
  });
});
