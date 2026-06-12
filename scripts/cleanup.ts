// Retention cleanup orchestrator (CLAUDE.md: 48-hour Storage retention policy):
// list videos whose mp4 has outlived the retention window → delete each object
// from Storage → clear `video_path` (keeping the row + run_logs for history).

import { fileURLToPath } from "node:url";

import {
  listExpiredVideos,
  deleteVideoObject,
  updateVideo,
  appendLog,
} from "./lib/supabaseAdmin.ts";

const RETENTION_DAYS = 2;

/**
 * Delete Storage objects for videos older than `retentionDays`, clearing each
 * row's `video_path`. Per-row failures are logged and skipped so one bad object
 * doesn't abort the batch. Returns the number of objects successfully deleted.
 */
export async function cleanup(retentionDays = RETENTION_DAYS): Promise<number> {
  const expired = await listExpiredVideos(retentionDays);
  let deleted = 0;

  for (const { id, video_path } of expired) {
    try {
      await deleteVideoObject(video_path);
      await updateVideo(id, { video_path: null });
      await appendLog(
        id,
        "cleanup",
        "info",
        "deleted expired video from storage",
      );
      deleted += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await appendLog(id, "cleanup", "error", `cleanup failed: ${message}`);
    }
  }

  return deleted;
}

// Run only when invoked directly (not when imported by tests). The cleanup
// workflow runs this on a daily schedule.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  cleanup()
    .then((deleted) => {
      console.log(`cleanup removed ${deleted} expired video(s)`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
