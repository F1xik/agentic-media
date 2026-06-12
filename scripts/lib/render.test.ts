// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  compositeFrame,
  ffmpegArgs,
  kenBurnsFilter,
  renderVideo,
  ZOOM_MAX,
  ZOOM_RATE,
} from "./render.ts";
import { gradientFallback } from "./backgroundImage.ts";

describe("ffmpegArgs", () => {
  it("builds the Ken Burns image + music render command", () => {
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
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "60",
      "-shortest",
      "-t",
      "30",
      "-movflags",
      "+faststart",
      "-vf",
      kenBurnsFilter(),
      "out.mp4",
    ]);
  });

  it("encodes with faststart so the moov atom is at the front of the mp4", () => {
    const args = ffmpegArgs("frame.png", "music.mp3", "out.mp4");
    const i = args.indexOf("-movflags");
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe("+faststart");
  });

  it("applies a centered zoom that renders back to the portrait frame", () => {
    const filter = kenBurnsFilter();
    expect(filter).toContain("zoompan=");
    expect(filter).toContain("s=1080x1920");
    // Pre-upscale 4× before zoompan so its per-frame integer crop rounding
    // stays sub-pixel in the output and the zoom doesn't stair-step/jitter.
    expect(filter).toContain("scale=4320:7680");
    // No longer a still image, so the stillimage tune must be gone.
    expect(ffmpegArgs("frame.png", "music.mp3", "out.mp4")).not.toContain(
      "stillimage",
    );
  });

  it("zooms strongly enough to read as motion", () => {
    // A near-static 1.1x zoom looked broken; the effect must be clearly visible.
    expect(ZOOM_MAX).toBeGreaterThanOrEqual(1.2);
    expect(kenBurnsFilter()).toContain(`min(zoom+${ZOOM_RATE},${ZOOM_MAX})`);
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
    const frame = await compositeFrame(
      bg,
      "Why do octopuses never faint?",
      "Octopuses have three hearts",
    );

    expect(frame.subarray(0, 4).toString("hex")).toBe("89504e47");
    const { default: sharp } = await import("sharp");
    const meta = await sharp(frame).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });
});
