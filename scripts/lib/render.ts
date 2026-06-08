// Composite the fact text onto the background (sharp) and render the final
// portrait mp4 (ffmpeg).

import { spawn } from "node:child_process";
import sharp from "sharp";
import { WIDTH, HEIGHT, wrapText, buildOverlaySvg } from "./textOverlay.ts";

/** Approx. characters per line at the default overlay font size. */
const MAX_CHARS_PER_LINE = 22;
/** Fewer chars per line for the larger hook font so it stays on-screen. */
const MAX_HOOK_CHARS_PER_LINE = 18;

/**
 * Resize the background to a portrait frame and composite the wrapped hook
 * (top) and fact text (centered) — each a contrast band + outlined text — over
 * it, returning a PNG buffer.
 */
export async function compositeFrame(
  bg: Buffer,
  hookText: string,
  factText: string,
): Promise<Buffer> {
  const base = await sharp(bg)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
    .toBuffer();

  const overlay = buildOverlaySvg({
    hookLines: wrapText(hookText, MAX_HOOK_CHARS_PER_LINE),
    lines: wrapText(factText, MAX_CHARS_PER_LINE),
  });

  return sharp(base)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/** A shell runner abstraction so the ffmpeg call can be mocked in tests. */
export type CommandRunner = (cmd: string, args: string[]) => Promise<void>;

const defaultRunner: CommandRunner = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr}`));
    });
  });

/** Output frame rate of the rendered video. */
export const FPS = 30;
/** Total clip length in seconds. */
export const DURATION_SECONDS = 30;
/** Maximum zoom the Ken Burns effect reaches by the end of the clip — enough to
 * read as clear motion rather than a near-static frame. */
export const ZOOM_MAX = 1.25;
/** Per-frame zoom increment; tuned so the zoom eases to ZOOM_MAX over the clip
 * (1 + 900*0.0003 = 1.27, clamped to ZOOM_MAX). */
export const ZOOM_RATE = 0.0003;

/**
 * Build the FFmpeg `-vf` filter: a slow centered Ken Burns zoom over the frame
 * so the video is never static. The frame is pre-upscaled 2× to reduce the
 * `zoompan` jitter that shows up when zooming a single still, then `zoompan`
 * eases in toward `ZOOM_MAX` and renders back down to the portrait frame size.
 */
export function kenBurnsFilter(): string {
  const totalFrames = FPS * DURATION_SECONDS;
  return [
    `scale=${WIDTH * 2}:${HEIGHT * 2}`,
    `zoompan=z='min(zoom+${ZOOM_RATE},${ZOOM_MAX})':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
    "format=yuv420p",
  ].join(",");
}

/** ffmpeg args for a 30s 1080x1920 Ken Burns image + music mp4 (see plan §5). */
export function ffmpegArgs(
  framePath: string,
  musicPath: string,
  outPath: string,
): string[] {
  return [
    "-y",
    "-loop",
    "1",
    "-i",
    framePath,
    "-i",
    musicPath,
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(FPS),
    "-shortest",
    "-t",
    String(DURATION_SECONDS),
    "-vf",
    kenBurnsFilter(),
    outPath,
  ];
}

export type RenderOptions = {
  framePath: string;
  musicPath: string;
  outPath: string;
  /** Injectable runner for tests; defaults to spawning `ffmpeg`. */
  run?: CommandRunner;
};

/** Render the final mp4 with ffmpeg. */
export function renderVideo({
  framePath,
  musicPath,
  outPath,
  run = defaultRunner,
}: RenderOptions): Promise<void> {
  return run("ffmpeg", ffmpegArgs(framePath, musicPath, outPath));
}
