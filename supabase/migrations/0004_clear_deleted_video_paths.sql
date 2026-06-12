-- 0004_clear_deleted_video_paths.sql
-- The videos Storage bucket was emptied manually, leaving every videos row
-- pointing at a now-deleted object via video_path. Clear those dangling
-- references so the dashboard hides Play/Download and the publish pipeline
-- won't try to download missing objects. Rows + run_logs are preserved for
-- history (same contract as the retention cleanup in scripts/cleanup.ts).
--
-- Idempotent: re-running affects zero rows once every video_path is null.
update public.videos
set video_path = null, updated_at = now()
where video_path is not null;
