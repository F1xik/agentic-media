// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./lib/supabaseAdmin.ts", () => ({
  listExpiredVideos: vi.fn(),
  deleteVideoObject: vi.fn(),
  updateVideo: vi.fn(),
  appendLog: vi.fn(),
}));

import { cleanup } from "./cleanup.ts";
import {
  listExpiredVideos,
  deleteVideoObject,
  updateVideo,
  appendLog,
} from "./lib/supabaseAdmin.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cleanup", () => {
  it("deletes each expired object, clears video_path, and logs", async () => {
    vi.mocked(listExpiredVideos).mockResolvedValue([
      { id: "old-1", video_path: "old-1.mp4" },
      { id: "old-2", video_path: "old-2.mp4" },
    ]);
    vi.mocked(deleteVideoObject).mockResolvedValue();
    vi.mocked(updateVideo).mockResolvedValue();
    vi.mocked(appendLog).mockResolvedValue();

    const deleted = await cleanup();

    expect(deleted).toBe(2);
    expect(deleteVideoObject).toHaveBeenCalledWith("old-1.mp4");
    expect(deleteVideoObject).toHaveBeenCalledWith("old-2.mp4");
    expect(updateVideo).toHaveBeenCalledWith("old-1", { video_path: null });
    expect(updateVideo).toHaveBeenCalledWith("old-2", { video_path: null });
    expect(appendLog).toHaveBeenCalledWith(
      "old-1",
      "cleanup",
      "info",
      "deleted expired video from storage",
    );
  });

  it("passes the retention window through to listExpiredVideos", async () => {
    vi.mocked(listExpiredVideos).mockResolvedValue([]);

    await cleanup();

    expect(listExpiredVideos).toHaveBeenCalledWith(30);
  });

  it("is a no-op when nothing is expired", async () => {
    vi.mocked(listExpiredVideos).mockResolvedValue([]);

    const deleted = await cleanup();

    expect(deleted).toBe(0);
    expect(deleteVideoObject).not.toHaveBeenCalled();
    expect(updateVideo).not.toHaveBeenCalled();
  });

  it("logs and skips a failing row but keeps processing the batch", async () => {
    vi.mocked(listExpiredVideos).mockResolvedValue([
      { id: "bad", video_path: "bad.mp4" },
      { id: "good", video_path: "good.mp4" },
    ]);
    vi.mocked(deleteVideoObject)
      .mockRejectedValueOnce(new Error("remove error"))
      .mockResolvedValueOnce();
    vi.mocked(updateVideo).mockResolvedValue();
    vi.mocked(appendLog).mockResolvedValue();

    const deleted = await cleanup();

    expect(deleted).toBe(1);
    // failing row: no path cleared, error logged.
    expect(updateVideo).not.toHaveBeenCalledWith("bad", { video_path: null });
    expect(appendLog).toHaveBeenCalledWith(
      "bad",
      "cleanup",
      "error",
      expect.stringContaining("remove error"),
    );
    // following row still processed.
    expect(deleteVideoObject).toHaveBeenCalledWith("good.mp4");
    expect(updateVideo).toHaveBeenCalledWith("good", { video_path: null });
  });
});
