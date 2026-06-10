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
  downloadVideo,
  deleteVideoObject,
  listExpiredVideos,
  getVideo,
  recentTopics,
  recentFacts,
  bumpTopic,
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

describe("getVideo", () => {
  it("selects the publish fields for a single id", async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: "video-uuid", status: "approved", youtube_id: null },
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });

    const row = await getVideo("video-uuid");
    expect(mockFrom).toHaveBeenCalledWith("videos");
    expect(mockEq).toHaveBeenCalledWith("id", "video-uuid");
    expect(row).toEqual({
      id: "video-uuid",
      status: "approved",
      youtube_id: null,
    });
  });

  it("throws when Supabase returns an error", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: vi
            .fn()
            .mockResolvedValue({ data: null, error: new Error("get error") }),
        }),
      }),
    });

    await expect(getVideo("video-uuid")).rejects.toThrow("get error");
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

describe("listExpiredVideos", () => {
  it("selects rows older than the cutoff that still have a video_path", async () => {
    const rows = [
      { id: "old-1", video_path: "old-1.mp4" },
      { id: "old-2", video_path: "old-2.mp4" },
    ];
    const mockNot = vi.fn().mockResolvedValue({ data: rows, error: null });
    const mockLt = vi.fn().mockReturnValue({ not: mockNot });
    const mockSelect = vi.fn().mockReturnValue({ lt: mockLt });
    mockFrom.mockReturnValue({ select: mockSelect });

    const before = Date.now();
    const result = await listExpiredVideos(30);

    expect(mockFrom).toHaveBeenCalledWith("videos");
    expect(mockSelect).toHaveBeenCalledWith("id, video_path");
    expect(mockNot).toHaveBeenCalledWith("video_path", "is", null);
    // cutoff is ~30 days before now.
    const [column, cutoff] = mockLt.mock.calls[0];
    expect(column).toBe("created_at");
    const expected = before - 30 * 24 * 60 * 60 * 1000;
    expect(Date.parse(cutoff as string)).toBeGreaterThanOrEqual(
      expected - 5000,
    );
    expect(Date.parse(cutoff as string)).toBeLessThanOrEqual(expected + 5000);
    expect(result).toEqual(rows);
  });

  it("returns an empty array when there are no rows", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        lt: () => ({
          not: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });

    expect(await listExpiredVideos()).toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        lt: () => ({
          not: vi
            .fn()
            .mockResolvedValue({ data: null, error: new Error("list error") }),
        }),
      }),
    });

    await expect(listExpiredVideos()).rejects.toThrow("list error");
  });
});

describe("recentTopics", () => {
  it("returns areas ordered by used_count", async () => {
    const mockLimit = vi.fn().mockResolvedValue({
      data: [{ area: "space" }, { area: "history" }],
      error: null,
    });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });

    const areas = await recentTopics(5);
    expect(mockFrom).toHaveBeenCalledWith("topics");
    expect(mockOrder).toHaveBeenCalledWith("used_count", { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(5);
    expect(areas).toEqual(["space", "history"]);
  });

  it("throws when Supabase returns an error", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => ({
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: new Error("topics error"),
          }),
        }),
      }),
    });
    await expect(recentTopics()).rejects.toThrow("topics error");
  });
});

describe("recentFacts", () => {
  it("returns non-null fact texts newest first", async () => {
    const mockLimit = vi.fn().mockResolvedValue({
      data: [{ fact_text: "fact b" }, { fact_text: "fact a" }],
      error: null,
    });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockNot = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelect = vi.fn().mockReturnValue({ not: mockNot });
    mockFrom.mockReturnValue({ select: mockSelect });

    const facts = await recentFacts(5);
    expect(mockFrom).toHaveBeenCalledWith("videos");
    expect(mockSelect).toHaveBeenCalledWith("fact_text");
    expect(mockNot).toHaveBeenCalledWith("fact_text", "is", null);
    expect(mockOrder).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(5);
    expect(facts).toEqual(["fact b", "fact a"]);
  });

  it("defaults to a limit of 10 and returns an empty array when there are no rows", async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockNot = vi.fn().mockReturnValue({ order: mockOrder });
    mockFrom.mockReturnValue({ select: () => ({ not: mockNot }) });

    expect(await recentFacts()).toEqual([]);
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it("throws when Supabase returns an error", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        not: () => ({
          order: () => ({
            limit: vi.fn().mockResolvedValue({
              data: null,
              error: new Error("facts error"),
            }),
          }),
        }),
      }),
    });
    await expect(recentFacts()).rejects.toThrow("facts error");
  });
});

describe("bumpTopic", () => {
  it("increments used_count for an existing topic", async () => {
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const mockMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: 7, used_count: 2 }, error: null });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      update: (payload: unknown) => {
        expect(payload).toEqual({ used_count: 3 });
        return { eq: mockUpdateEq };
      },
    });

    await bumpTopic("space");
    expect(mockUpdateEq).toHaveBeenCalledWith("id", 7);
  });

  it("inserts a new topic at used_count 1", async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      insert: mockInsert,
    });

    await bumpTopic("new area");
    expect(mockInsert).toHaveBeenCalledWith({
      area: "new area",
      used_count: 1,
    });
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

describe("deleteVideoObject", () => {
  it("removes the object by path", async () => {
    const mockRemove = vi.fn().mockResolvedValue({ error: null });
    mockStorageFrom.mockReturnValue({ remove: mockRemove });

    await deleteVideoObject("video-uuid.mp4");

    expect(mockStorageFrom).toHaveBeenCalledWith("videos");
    expect(mockRemove).toHaveBeenCalledWith(["video-uuid.mp4"]);
  });

  it("throws when Supabase returns an error", async () => {
    mockStorageFrom.mockReturnValue({
      remove: vi.fn().mockResolvedValue({ error: new Error("remove error") }),
    });

    await expect(deleteVideoObject("video-uuid.mp4")).rejects.toThrow(
      "remove error",
    );
  });
});

describe("downloadVideo", () => {
  it("downloads the object and returns a Buffer", async () => {
    const blob = {
      arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
    };
    const mockDownload = vi.fn().mockResolvedValue({ data: blob, error: null });
    mockStorageFrom.mockReturnValue({ download: mockDownload });

    const buf = await downloadVideo("video-uuid.mp4");

    expect(mockStorageFrom).toHaveBeenCalledWith("videos");
    expect(mockDownload).toHaveBeenCalledWith("video-uuid.mp4");
    expect(buf).toEqual(Buffer.from([1, 2, 3]));
  });

  it("throws when Supabase returns an error", async () => {
    mockStorageFrom.mockReturnValue({
      download: vi
        .fn()
        .mockResolvedValue({ data: null, error: new Error("download error") }),
    });

    await expect(downloadVideo("video-uuid.mp4")).rejects.toThrow(
      "download error",
    );
  });
});
