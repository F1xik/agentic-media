// Composite the fact text onto the background (sharp) and render the final
// portrait mp4 (ffmpeg).

import { spawn } from "node:child_process";
import sharp from "sharp";
import { WIDTH, HEIGHT, wrapText, buildOverlaySvg } from "./textOverlay.ts";

/** Approx. characters per line at the default overlay font size. */
const MAX_CHARS_PER_LINE = 22;

/**
 * Resize the background to a portrait frame and composite the wrapped fact text
 * (contrast band + outlined text) over it, returning a PNG buffer.
 */
export async function compositeFrame(
  bg: Buffer,
  factText: string,
): Promise<Buffer> {
  const base = await sharp(bg)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
    .toBuffer();

  const overlay = buildOverlaySvg({
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

/** ffmpeg args for a 30s 1080x1920 still-image + music mp4 (see plan §5). */
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
    `scale=${WIDTH}:${HEIGHT}`,
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
