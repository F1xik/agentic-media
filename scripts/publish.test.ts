// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./lib/supabaseAdmin.ts", () => ({
  getVideo: vi.fn(),
  updateVideo: vi.fn(),
  appendLog: vi.fn(),
  downloadVideo: vi.fn(),
}));
vi.mock("./lib/youtube.ts", () => ({
  uploadToYouTube: vi.fn(),
}));

import { publish, buildMetadata } from "./publish.ts";
import {
  getVideo,
  updateVideo,
  appendLog,
  downloadVideo,
} from "./lib/supabaseAdmin.ts";
import { uploadToYouTube } from "./lib/youtube.ts";
import type { VideoRow } from "./lib/supabaseAdmin.ts";

const baseVideo: VideoRow = {
  id: "vid-1",
  status: "approved",
  youtube_id: null,
  video_path: "vid-1.mp4",
  fact_text: "Octopuses have three hearts.",
  topic: "Marine biology",
  music_attribution: "Carefree by Kevin MacLeod (CC-BY 4.0)",
};

function happyPath(overrides: Partial<VideoRow> = {}) {
  vi.mocked(getVideo).mockResolvedValue({ ...baseVideo, ...overrides });
  vi.mocked(downloadVideo).mockResolvedValue(Buffer.from("mp4"));
  vi.mocked(uploadToYouTube).mockResolvedValue({
    id: "yt-123",
    url: "https://www.youtube.com/watch?v=yt-123",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.YT_PRIVACY_STATUS;
});

describe("publish", () => {
  it("uploads and advances the row to published", async () => {
    happyPath();

    await publish("vid-1");

    expect(updateVideo).toHaveBeenCalledWith("vid-1", { status: "publishing" });
    expect(downloadVideo).toHaveBeenCalledWith("vid-1.mp4");
    expect(uploadToYouTube).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: expect.any(Buffer),
        privacyStatus: "private",
        description: expect.stringContaining("#Shorts"),
      }),
    );
    expect(updateVideo).toHaveBeenCalledWith("vid-1", {
      status: "published",
      youtube_id: "yt-123",
      youtube_url: "https://www.youtube.com/watch?v=yt-123",
    });
  });

  it("appends #Shorts to the title", async () => {
    happyPath();

    await publish("vid-1");

    const arg = vi.mocked(uploadToYouTube).mock.calls[0][0];
    expect(arg.title).toContain("#Shorts");
    expect(arg.description).toContain("Carefree by Kevin MacLeod");
  });

  it("honours the YT_PRIVACY_STATUS override", async () => {
    happyPath();
    process.env.YT_PRIVACY_STATUS = "unlisted";

    await publish("vid-1");

    expect(uploadToYouTube).toHaveBeenCalledWith(
      expect.objectContaining({ privacyStatus: "unlisted" }),
    );
  });

  it("is a no-op when youtube_id is already set", async () => {
    happyPath({ youtube_id: "existing", status: "published" });

    await publish("vid-1");

    expect(appendLog).toHaveBeenCalledWith(
      "vid-1",
      "publish",
      "info",
      expect.stringContaining("no-op"),
    );
    expect(updateVideo).not.toHaveBeenCalled();
    expect(downloadVideo).not.toHaveBeenCalled();
    expect(uploadToYouTube).not.toHaveBeenCalled();
  });

  it("marks the row failed when video_path is missing", async () => {
    happyPath({ video_path: null });

    await expect(publish("vid-1")).rejects.toThrow(/video_path/);

    expect(updateVideo).toHaveBeenCalledWith("vid-1", {
      status: "failed",
      error: expect.stringContaining("video_path"),
    });
    expect(uploadToYouTube).not.toHaveBeenCalled();
  });

  it("marks the row failed and rethrows when the upload fails", async () => {
    happyPath();
    vi.mocked(uploadToYouTube).mockRejectedValue(new Error("yt boom"));

    await expect(publish("vid-1")).rejects.toThrow("yt boom");

    expect(appendLog).toHaveBeenCalledWith(
      "vid-1",
      "error",
      "error",
      "yt boom",
    );
    expect(updateVideo).toHaveBeenCalledWith("vid-1", {
      status: "failed",
      error: "yt boom",
    });
  });
});

describe("buildMetadata", () => {
  it("truncates the title to 100 chars including #Shorts", async () => {
    const longFact = "A".repeat(200);
    const { title } = buildMetadata({ ...baseVideo, fact_text: longFact });

    expect(title.length).toBeLessThanOrEqual(100);
    expect(title.endsWith("#Shorts")).toBe(true);
  });

  it("falls back to the topic when there is no fact text", async () => {
    const { title, description } = buildMetadata({
      ...baseVideo,
      fact_text: null,
    });

    expect(title).toContain("Marine biology");
    expect(description).toContain("Topic: Marine biology");
  });
});
