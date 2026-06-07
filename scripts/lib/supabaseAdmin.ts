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
  video_path: string;
  youtube_id: string;
  youtube_url: string;
  error: string;
}>;

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
