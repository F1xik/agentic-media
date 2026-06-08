// Publish orchestrator (see docs/tasks/14-publish-script.md):
// read an approved video row → download its mp4 from Storage → upload to
// YouTube Shorts → record `youtube_id`/`youtube_url`, idempotently.

import { fileURLToPath } from "node:url";

import {
  getVideo,
  updateVideo,
  appendLog,
  downloadVideo,
  type VideoRow,
} from "./lib/supabaseAdmin.ts";
import { uploadToYouTube, type PrivacyStatus } from "./lib/youtube.ts";

const SHORTS_TAG = "#Shorts";
const TITLE_MAX = 100; // YouTube's title length limit.

/** Resolve the configured default privacy (CLAUDE.md: default to `private`). */
function defaultPrivacy(): PrivacyStatus {
  const value = process.env.YT_PRIVACY_STATUS;
  if (value === "private" || value === "unlisted" || value === "public") {
    return value;
  }
  return "private";
}

/**
 * Build the YouTube title/description from the video row. The title is the fact
 * text (falling back to the topic), truncated so the appended `#Shorts` keeps it
 * within YouTube's 100-char limit. The description repeats the fact, the topic,
 * the music attribution, and `#Shorts` so the upload is classified as a Short
 * even when the title is truncated.
 */
export function buildMetadata(video: VideoRow): {
  title: string;
  description: string;
} {
  const base = (video.fact_text ?? video.topic ?? "Did you know?").trim();
  const suffix = ` ${SHORTS_TAG}`;
  const room = TITLE_MAX - suffix.length;
  const truncated = base.length > room ? base.slice(0, room).trimEnd() : base;
  const title = `${truncated}${suffix}`;

  const lines: string[] = [];
  if (video.fact_text) lines.push(video.fact_text.trim());
  if (video.topic) lines.push(`Topic: ${video.topic}`);
  if (video.music_attribution) lines.push(video.music_attribution.trim());
  lines.push(SHORTS_TAG);
  const description = lines.join("\n\n");

  return { title, description };
}

/**
 * Publish an approved video to YouTube. No-ops if it already has a `youtube_id`.
 * Advances the row `publishing → published` (with id/url) on success, or marks
 * it `failed` (with the error text) and rethrows on any step failure.
 */
export async function publish(videoId: string): Promise<void> {
  const video = await getVideo(videoId);

  // Idempotency: a prior run already uploaded this video.
  if (video.youtube_id) {
    await appendLog(
      videoId,
      "publish",
      "info",
      `already published as ${video.youtube_id}; no-op`,
    );
    return;
  }

  try {
    await appendLog(videoId, "publish", "info", "publish started");
    await updateVideo(videoId, { status: "publishing" });

    if (!video.video_path) {
      throw new Error("video has no video_path to download");
    }

    const buffer = await downloadVideo(video.video_path);
    await appendLog(videoId, "download", "info", "downloaded mp4 from storage");

    const { title, description } = buildMetadata(video);
    const privacyStatus = defaultPrivacy();
    const { id, url } = await uploadToYouTube({
      title,
      description,
      privacyStatus,
      buffer,
    });

    await updateVideo(videoId, {
      status: "published",
      youtube_id: id,
      youtube_url: url,
    });
    await appendLog(videoId, "done", "info", `published as ${id} (${url})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendLog(videoId, "error", "error", message);
    await updateVideo(videoId, { status: "failed", error: message });
    throw err;
  }
}

// Run only when invoked directly (not when imported by tests). The publish
// workflow passes the dispatch payload's video id via VIDEO_ID (or argv[2]).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const videoId = process.env.VIDEO_ID ?? process.argv[2];
  if (!videoId) {
    console.error("VIDEO_ID env var or a video id argument is required");
    process.exit(1);
  }
  publish(videoId)
    .then(() => {
      console.log(`published video ${videoId}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
