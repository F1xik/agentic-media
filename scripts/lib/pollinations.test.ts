// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  pollinationsUrl,
  gradientFallback,
  fetchBackground,
} from "./pollinations.ts";

describe("pollinationsUrl", () => {
  it("encodes the prompt and sets portrait dimensions", () => {
    const url = pollinationsUrl("an octopus & coral");
    expect(url).toContain("image.pollinations.ai/prompt/");
    expect(url).toContain("an%20octopus%20%26%20coral");
    expect(url).toContain("width=1080&height=1920&nologo=true");
  });
});

describe("gradientFallback", () => {
  it("produces a PNG buffer at frame size", async () => {
    const buffer = await gradientFallback();
    expect(buffer.length).toBeGreaterThan(0);
    // PNG magic number.
    expect(buffer.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});

describe("fetchBackground", () => {
  it("returns the fetched bytes on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const result = await fetchBackground("ocean", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.usedFallback).toBe(false);
    expect([...result.buffer]).toEqual([1, 2, 3]);
  });

  it("falls back to the gradient on a non-OK response after all retries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const result = await fetchBackground("ocean", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retries: 1,
    });
    expect(result.usedFallback).toBe(true);
    expect(result.buffer.subarray(0, 4).toString("hex")).toBe("89504e47");
  });

  it("falls back to the gradient when the fetch throws after all retries", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await fetchBackground("ocean", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retries: 1,
    });
    expect(result.usedFallback).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("succeeds on a later retry after an initial failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
      });

    const result = await fetchBackground("ocean", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retries: 2,
    });

    expect(result.usedFallback).toBe(false);
    expect([...result.buffer]).toEqual([9, 8, 7]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
