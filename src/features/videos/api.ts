import { supabase } from "../../lib/supabase";

export type VideoStatus =
  | "generating"
  | "pending_review"
  | "approved"
  | "publishing"
  | "published"
  | "rejected"
  | "failed";

export interface Video {
  id: string;
  status: VideoStatus;
  topic: string | null;
  fact_text: string | null;
  image_prompt: string | null;
  music_track: string | null;
  music_attribution: string | null;
  video_path: string | null;
  youtube_id: string | null;
  youtube_url: string | null;
  error: string | null;
  run_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function getVideos(statusFilter?: VideoStatus): Promise<Video[]> {
  let query = supabase
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getSignedVideoUrl(videoPath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("videos")
    .createSignedUrl(videoPath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function approveVideo(id: string): Promise<void> {
  const { error } = await supabase
    .from("videos")
    .update({ status: "approved" })
    .eq("id", id);
  if (error) throw error;
}

export async function rejectVideo(id: string): Promise<void> {
  const { error } = await supabase
    .from("videos")
    .update({ status: "rejected" })
    .eq("id", id);
  if (error) throw error;
}

// ── dispatch relay ──────────────────────────────────────────────────────────
// POST to the Vercel dispatch route (api/dispatch.ts), which validates the
// caller's Supabase access token and fires the matching GitHub
// `repository_dispatch` event. The token is passed through as a Bearer header.
async function postDispatch(
  token: string,
  body: { event: "generate" | "publish"; video_id?: string },
): Promise<void> {
  const res = await fetch("/api/dispatch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `Dispatch failed (${res.status})`);
  }
}

export async function triggerGenerate(token: string): Promise<void> {
  await postDispatch(token, { event: "generate" });
}

export async function triggerPublish(
  token: string,
  videoId: string,
): Promise<void> {
  await postDispatch(token, { event: "publish", video_id: videoId });
}
