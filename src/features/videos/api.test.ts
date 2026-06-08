import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getVideos,
  getSignedVideoUrl,
  approveVideo,
  rejectVideo,
  triggerGenerate,
  triggerPublish,
} from "./api";

const { mockFrom, mockStorageFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockStorageFrom: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: mockFrom,
    storage: { from: mockStorageFrom },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getVideos", () => {
  it("returns data when no filter", async () => {
    const rows = [{ id: "1", status: "published" }];
    mockFrom.mockReturnValue({
      select: () => ({
        order: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    });

    const result = await getVideos();
    expect(result).toEqual(rows);
  });

  it("calls .eq when statusFilter is provided", async () => {
    const rows = [{ id: "2", status: "pending_review" }];
    const mockEq = vi.fn().mockResolvedValue({ data: rows, error: null });
    mockFrom.mockReturnValue({
      select: () => ({ order: () => ({ eq: mockEq }) }),
    });

    const result = await getVideos("pending_review");
    expect(mockEq).toHaveBeenCalledWith("status", "pending_review");
    expect(result).toEqual(rows);
  });

  it("throws on error", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: vi
          .fn()
          .mockResolvedValue({ data: null, error: new Error("db error") }),
      }),
    });

    await expect(getVideos()).rejects.toThrow("db error");
  });
});

describe("getSignedVideoUrl", () => {
  it("returns signedUrl on success", async () => {
    mockStorageFrom.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://signed" },
        error: null,
      }),
    });

    const url = await getSignedVideoUrl("abc.mp4");
    expect(url).toBe("https://signed");
    expect(mockStorageFrom).toHaveBeenCalledWith("videos");
  });

  it("throws on storage error", async () => {
    mockStorageFrom.mockReturnValue({
      createSignedUrl: vi
        .fn()
        .mockResolvedValue({ data: null, error: new Error("storage error") }),
    });

    await expect(getSignedVideoUrl("abc.mp4")).rejects.toThrow("storage error");
  });
});

describe("approveVideo", () => {
  it("updates status to approved for the given id", async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    await approveVideo("vid-1");

    expect(mockFrom).toHaveBeenCalledWith("videos");
    expect(mockUpdate).toHaveBeenCalledWith({ status: "approved" });
    expect(mockEq).toHaveBeenCalledWith("id", "vid-1");
  });

  it("throws on error", async () => {
    const mockEq = vi
      .fn()
      .mockResolvedValue({ error: new Error("update error") });
    mockFrom.mockReturnValue({ update: () => ({ eq: mockEq }) });

    await expect(approveVideo("vid-1")).rejects.toThrow("update error");
  });
});

describe("rejectVideo", () => {
  it("updates status to rejected for the given id", async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    await rejectVideo("vid-2");

    expect(mockFrom).toHaveBeenCalledWith("videos");
    expect(mockUpdate).toHaveBeenCalledWith({ status: "rejected" });
    expect(mockEq).toHaveBeenCalledWith("id", "vid-2");
  });

  it("throws on error", async () => {
    const mockEq = vi
      .fn()
      .mockResolvedValue({ error: new Error("update error") });
    mockFrom.mockReturnValue({ update: () => ({ eq: mockEq }) });

    await expect(rejectVideo("vid-2")).rejects.toThrow("update error");
  });
});

describe("triggerGenerate", () => {
  it("posts a generate event with the bearer token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    await triggerGenerate("tok-123");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dispatch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tok-123",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ event: "generate" }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("throws the route error message on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: "Not authorized" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(triggerGenerate("tok-123")).rejects.toThrow("Not authorized");

    vi.unstubAllGlobals();
  });
});

describe("triggerPublish", () => {
  it("posts a publish event with the video id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    await triggerPublish("tok-123", "vid-9");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dispatch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok-123" }),
        body: JSON.stringify({ event: "publish", video_id: "vid-9" }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("falls back to a status message when no error body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error("no body")),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(triggerPublish("tok-123", "vid-9")).rejects.toThrow(
      "Dispatch failed (502)",
    );

    vi.unstubAllGlobals();
  });
});
