// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { compositeFrame, ffmpegArgs, renderVideo } from "./render.ts";
import { gradientFallback } from "./backgroundImage.ts";

describe("ffmpegArgs", () => {
  it("builds the still-image + music render command", () => {
    const args = ffmpegArgs("frame.png", "music.mp3", "out.mp4");
    expect(args).toEqual([
      "-y",
      "-loop",
      "1",
      "-i",
      "frame.png",
      "-i",
      "music.mp3",
      "-c:v",
      "libx264",
      "-tune",
      "stillimage",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-pix_fmt",
      "yuv420p",
      "-shortest",
      "-t",
      "30",
      "-vf",
      "scale=1080:1920",
      "out.mp4",
    ]);
  });
});

describe("renderVideo", () => {
  it("invokes ffmpeg with the expected args", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    await renderVideo({
      framePath: "frame.png",
      musicPath: "music.mp3",
      outPath: "out.mp4",
      run,
    });
    expect(run).toHaveBeenCalledWith(
      "ffmpeg",
      ffmpegArgs("frame.png", "music.mp3", "out.mp4"),
    );
  });
});

describe("compositeFrame", () => {
  it("returns a portrait PNG with the text composited", async () => {
    const bg = await gradientFallback();
    const frame = await compositeFrame(bg, "Octopuses have three hearts");

    expect(frame.subarray(0, 4).toString("hex")).toBe("89504e47");
    const { default: sharp } = await import("sharp");
    const meta = await sharp(frame).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });
});
