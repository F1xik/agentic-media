// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./lib/supabaseAdmin.ts", () => ({
  insertVideo: vi.fn(),
  updateVideo: vi.fn(),
  appendLog: vi.fn(),
  uploadVideo: vi.fn(),
  recentTopics: vi.fn(),
  bumpTopic: vi.fn(),
}));
vi.mock("./lib/musicAssets.ts", () => ({
  parseCredits: vi.fn(),
  getAttribution: vi.fn(),
  MUSIC_DIR: "/music",
}));
vi.mock("./lib/producer.ts", () => ({
  produceReviewedSpec: vi.fn(),
}));
vi.mock("./lib/backgroundImage.ts", () => ({
  fetchBackground: vi.fn(),
}));
vi.mock("./lib/render.ts", () => ({
  compositeFrame: vi.fn(),
  renderVideo: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

import { generate } from "./generate.ts";
import {
  insertVideo,
  updateVideo,
  appendLog,
  uploadVideo,
  recentTopics,
  bumpTopic,
} from "./lib/supabaseAdmin.ts";
import { parseCredits, getAttribution } from "./lib/musicAssets.ts";
import { produceReviewedSpec } from "./lib/producer.ts";
import { fetchBackground } from "./lib/backgroundImage.ts";
import { compositeFrame, renderVideo } from "./lib/render.ts";
import { readFile, writeFile } from "node:fs/promises";

const spec = {
  topic: "Marine biology",
  hook: "How many hearts does an octopus have?",
  fact_text: "Octopuses have three hearts.",
  image_prompt: "an octopus",
  music: "carefree",
};

function happyPath() {
  vi.mocked(insertVideo).mockResolvedValue({ id: "vid-1" });
  vi.mocked(recentTopics).mockResolvedValue(["space"]);
  vi.mocked(parseCredits).mockReturnValue([
    {
      id: "carefree",
      filename: "carefree.mp3",
      title: "Carefree",
      mood: "chill",
      attribution: "attr",
    },
  ]);
  vi.mocked(produceReviewedSpec).mockImplementation(async ({ onRound }) => {
    const verdict = { approved: true, issues: [] };
    await onRound?.({ attempt: 1, spec, verdict });
    return { spec, verdict, attempts: 1 };
  });
  vi.mocked(getAttribution).mockReturnValue("Carefree attribution");
  vi.mocked(fetchBackground).mockResolvedValue({
    buffer: Buffer.from("bg"),
    usedFallback: false,
  });
  vi.mocked(compositeFrame).mockResolvedValue(Buffer.from("frame"));
  vi.mocked(renderVideo).mockResolvedValue();
  vi.mocked(readFile).mockResolvedValue(Buffer.from("mp4"));
  vi.mocked(uploadVideo).mockResolvedValue("vid-1.mp4");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generate", () => {
  it("runs the pipeline and lands at pending_review", async () => {
    happyPath();

    const id = await generate();

    expect(id).toBe("vid-1");
    expect(insertVideo).toHaveBeenCalledWith({
      status: "generating",
      run_id: process.env.GITHUB_RUN_ID,
    });
    expect(produceReviewedSpec).toHaveBeenCalledWith({
      avoidTopics: ["space"],
      validMusicIds: ["carefree"],
      onRound: expect.any(Function),
    });
    expect(appendLog).toHaveBeenCalledWith(
      "vid-1",
      "evaluate",
      "info",
      "approved on attempt 1",
    );
    expect(writeFile).toHaveBeenCalledWith("frame.png", expect.any(Buffer));
    expect(renderVideo).toHaveBeenCalledWith({
      framePath: "frame.png",
      musicPath: "/music/carefree.mp3",
      outPath: "out.mp4",
    });
    expect(uploadVideo).toHaveBeenCalledWith("vid-1", expect.any(Buffer));
    expect(updateVideo).toHaveBeenCalledWith("vid-1", {
      status: "pending_review",
      video_path: "vid-1.mp4",
    });
    expect(bumpTopic).toHaveBeenCalledWith("Marine biology");
  });

  it("logs a warning when the image fallback is used", async () => {
    happyPath();
    vi.mocked(fetchBackground).mockResolvedValue({
      buffer: Buffer.from("grad"),
      usedFallback: true,
    });

    await generate();

    expect(appendLog).toHaveBeenCalledWith(
      "vid-1",
      "image",
      "warn",
      expect.stringContaining("fallback"),
    );
  });

  it("marks the row failed when the evaluator loop is exhausted", async () => {
    happyPath();
    vi.mocked(produceReviewedSpec).mockRejectedValue(
      new Error("generation rejected after 3 attempts: unverifiable claim"),
    );

    await expect(generate()).rejects.toThrow(/rejected after 3 attempts/);

    expect(updateVideo).toHaveBeenCalledWith("vid-1", {
      status: "failed",
      error: "generation rejected after 3 attempts: unverifiable claim",
    });
    expect(uploadVideo).not.toHaveBeenCalled();
  });

  it("marks the row failed and rethrows on a step error", async () => {
    happyPath();
    vi.mocked(renderVideo).mockRejectedValue(new Error("ffmpeg boom"));

    await expect(generate()).rejects.toThrow("ffmpeg boom");

    expect(appendLog).toHaveBeenCalledWith(
      "vid-1",
      "error",
      "error",
      "ffmpeg boom",
    );
    expect(updateVideo).toHaveBeenCalledWith("vid-1", {
      status: "failed",
      error: "ffmpeg boom",
    });
    expect(uploadVideo).not.toHaveBeenCalled();
  });
});
