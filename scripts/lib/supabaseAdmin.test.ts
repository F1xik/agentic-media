// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateClient, mockFrom, mockStorageFrom } = vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  const mockFrom = vi.fn();
  const mockStorageFrom = vi.fn();
  const mockCreateClient = vi.fn(() => ({
    from: mockFrom,
    storage: { from: mockStorageFrom },
  }));

  return { mockCreateClient, mockFrom, mockStorageFrom };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

import {
  insertVideo,
  updateVideo,
  appendLog,
  uploadVideo,
} from "./supabaseAdmin.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("insertVideo", () => {
  it("inserts a videos row and returns the id", async () => {
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: vi
            .fn()
            .mockResolvedValue({ data: { id: "video-uuid" }, error: null }),
        }),
      }),
    });

    const result = await insertVideo({ topic: "fun facts" });
    expect(mockFrom).toHaveBeenCalledWith("videos");
    expect(result).toEqual({ id: "video-uuid" });
  });

  it("throws when Supabase returns an error", async () => {
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: vi
            .fn()
            .mockResolvedValue({ data: null, error: new Error("db error") }),
        }),
      }),
    });

    await expect(insertVideo({})).rejects.toThrow("db error");
  });
});

describe("updateVideo", () => {
  it("updates the videos row by id", async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ update: () => ({ eq: mockEq }) });

    await updateVideo("video-uuid", { status: "approved" });
    expect(mockFrom).toHaveBeenCalledWith("videos");
    expect(mockEq).toHaveBeenCalledWith("id", "video-uuid");
  });

  it("throws when Supabase returns an error", async () => {
    mockFrom.mockReturnValue({
      update: () => ({
        eq: vi.fn().mockResolvedValue({ error: new Error("update error") }),
      }),
    });

    await expect(updateVideo("video-uuid", {})).rejects.toThrow("update error");
  });
});

describe("appendLog", () => {
  it("inserts a run_logs row with correct fields", async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ insert: mockInsert });

    await appendLog("video-uuid", "generate", "info", "started");
    expect(mockFrom).toHaveBeenCalledWith("run_logs");
    expect(mockInsert).toHaveBeenCalledWith({
      video_id: "video-uuid",
      step: "generate",
      level: "info",
      message: "started",
    });
  });

  it("throws when Supabase returns an error", async () => {
    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: new Error("log error") }),
    });

    await expect(
      appendLog("video-uuid", "step", "error", "boom"),
    ).rejects.toThrow("log error");
  });
});

describe("uploadVideo", () => {
  it("uploads the buffer and returns the storage path", async () => {
    const mockUpload = vi.fn().mockResolvedValue({ error: null });
    mockStorageFrom.mockReturnValue({ upload: mockUpload });

    const buf = Buffer.from("mp4 data");
    const path = await uploadVideo("video-uuid", buf);

    expect(mockStorageFrom).toHaveBeenCalledWith("videos");
    expect(mockUpload).toHaveBeenCalledWith("video-uuid.mp4", buf, {
      contentType: "video/mp4",
      upsert: true,
    });
    expect(path).toBe("video-uuid.mp4");
  });

  it("uses the provided content type", async () => {
    const mockUpload = vi.fn().mockResolvedValue({ error: null });
    mockStorageFrom.mockReturnValue({ upload: mockUpload });

    await uploadVideo("video-uuid", Buffer.from("data"), "video/webm");
    expect(mockUpload).toHaveBeenCalledWith(
      "video-uuid.mp4",
      expect.any(Buffer),
      { contentType: "video/webm", upsert: true },
    );
  });

  it("throws when Supabase returns an error", async () => {
    mockStorageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: new Error("upload error") }),
    });

    await expect(
      uploadVideo("video-uuid", Buffer.from("data")),
    ).rejects.toThrow("upload error");
  });
});
