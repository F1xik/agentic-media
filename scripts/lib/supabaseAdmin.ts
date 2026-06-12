import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("SUPABASE_URL is not set");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

export const adminClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

// ── videos ────────────────────────────────────────────────────────────────────

type VideoInsert = {
  status?: string;
  topic?: string;
  fact_text?: string;
  image_prompt?: string;
  music_track?: string;
  music_attribution?: string;
  video_path?: string;
  run_id?: string;
};

type VideoUpdate = Partial<{
  status: string;
  topic: string;
  fact_text: string;
  image_prompt: string;
  music_track: string;
  music_attribution: string;
  video_path: string | null;
  youtube_id: string;
  youtube_url: string;
  error: string;
}>;

/** The subset of a `videos` row the publish pipeline reads. */
export type VideoRow = {
  id: string;
  status: string;
  youtube_id: string | null;
  video_path: string | null;
  fact_text: string | null;
  topic: string | null;
  music_attribution: string | null;
};

export async function insertVideo(data: VideoInsert): Promise<{ id: string }> {
  const { data: row, error } = await adminClient
    .from("videos")
    .insert(data)
    .select("id")
    .single();
  if (error) throw error;
  return row as { id: string };
}

export async function updateVideo(
  id: string,
  data: VideoUpdate,
): Promise<void> {
  const { error } = await adminClient.from("videos").update(data).eq("id", id);
  if (error) throw error;
}

/** Read the fields the publish pipeline needs for a single video by id. */
export async function getVideo(id: string): Promise<VideoRow> {
  const { data, error } = await adminClient
    .from("videos")
    .select(
      "id, status, youtube_id, video_path, fact_text, topic, music_attribution",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as VideoRow;
}

/**
 * List videos whose Storage object is eligible for retention cleanup: rows older
 * than `olderThanDays` (by `created_at`) that still have a `video_path`. Used by
 * the cleanup job to free Storage while keeping the rows for history.
 */
export async function listExpiredVideos(
  olderThanDays = 30,
): Promise<{ id: string; video_path: string }[]> {
  const cutoff = new Date(
    Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await adminClient
    .from("videos")
    .select("id, video_path")
    .lt("created_at", cutoff)
    .not("video_path", "is", null);
  if (error) throw error;
  return (data ?? []) as { id: string; video_path: string }[];
}

// ── topics ────────────────────────────────────────────────────────────────────

/** Most recently-used topic areas (highest `used_count` first) to bias against. */
export async function recentTopics(limit = 10): Promise<string[]> {
  const { data, error } = await adminClient
    .from("topics")
    .select("area")
    .order("used_count", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { area: string }).area);
}

/**
 * The most recently-created fact texts (newest first) to dedup new generations
 * against. Filters out rows without a fact yet (e.g. in-progress `generating`
 * rows); no status filter, so we dedup against every fact that reached text
 * generation regardless of approve/reject/publish state.
 */
export async function recentFacts(limit = 5): Promise<string[]> {
  const { data, error } = await adminClient
    .from("videos")
    .select("fact_text")
    .not("fact_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { fact_text: string }).fact_text);
}

/** Record use of a topic area: increment `used_count`, inserting it if new. */
export async function bumpTopic(area: string): Promise<void> {
  const { data, error } = await adminClient
    .from("topics")
    .select("id, used_count")
    .eq("area", area)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    const row = data as { id: number; used_count: number };
    const { error: updateError } = await adminClient
      .from("topics")
      .update({ used_count: row.used_count + 1 })
      .eq("id", row.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await adminClient
      .from("topics")
      .insert({ area, used_count: 1 });
    if (insertError) throw insertError;
  }
}

// ── run_logs ──────────────────────────────────────────────────────────────────

export async function appendLog(
  videoId: string,
  step: string,
  level: "info" | "warn" | "error",
  message: string,
): Promise<void> {
  const { error } = await adminClient
    .from("run_logs")
    .insert({ video_id: videoId, step, level, message });
  if (error) throw error;
}

// ── storage ───────────────────────────────────────────────────────────────────

export async function uploadVideo(
  videoId: string,
  buffer: Buffer,
  contentType = "video/mp4",
): Promise<string> {
  const path = `${videoId}.mp4`;
  const { error } = await adminClient.storage
    .from("videos")
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

/**
 * Delete a video object from Storage by its path (retention cleanup).
 * Idempotent: an already-absent object is treated as success, so a
 * manually-deleted mp4 still lets cleanup clear the dangling `video_path`
 * instead of failing that row on every run. Genuine errors still throw.
 */
export async function deleteVideoObject(path: string): Promise<void> {
  const { error } = await adminClient.storage.from("videos").remove([path]);
  if (error && !isObjectNotFound(error)) throw error;
}

/** True when a Storage error means the object simply isn't there (404). */
function isObjectNotFound(error: unknown): boolean {
  const e = error as {
    message?: string;
    status?: number;
    statusCode?: string | number;
  };
  if (e.status === 404 || e.statusCode === 404 || e.statusCode === "404") {
    return true;
  }
  return /not.?found/i.test(e.message ?? "");
}

/** Download a video object from Storage by its path, as a Buffer. */
export async function downloadVideo(path: string): Promise<Buffer> {
  const { data, error } = await adminClient.storage
    .from("videos")
    .download(path);
  if (error) throw error;
  if (!data) throw new Error(`no data for storage object "${path}"`);
  return Buffer.from(await data.arrayBuffer());
}
