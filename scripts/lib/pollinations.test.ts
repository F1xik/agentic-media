// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { gradientFallback, fetchBackground } from "./pollinations.ts";

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
