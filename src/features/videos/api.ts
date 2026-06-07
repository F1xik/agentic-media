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
