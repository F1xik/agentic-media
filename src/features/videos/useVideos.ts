import { useQuery } from "@tanstack/react-query";
import {
  getVideos,
  getSignedVideoUrl,
  getSignedVideoDownloadUrl,
  type VideoStatus,
} from "./api";

export function useVideos(statusFilter?: VideoStatus | VideoStatus[]) {
  // Normalize to a stable key so each tab (single status or status group)
  // caches independently regardless of array ordering.
  const key = Array.isArray(statusFilter)
    ? [...statusFilter].sort().join(",")
    : (statusFilter ?? null);
  return useQuery({
    queryKey: ["videos", key],
    queryFn: () => getVideos(statusFilter),
  });
}

// Signed-URL queries are gated behind an explicit `enabled` flag so the dashboard
// does not mint a signed URL (or let the browser download the mp4) for every card
// on list render — only when the owner actually plays or downloads a clip. This is
// the change that keeps routine browsing from blowing through Storage egress.
export function useSignedVideoUrl(videoPath: string | null, enabled = true) {
  return useQuery({
    queryKey: ["signed-url", videoPath],
    queryFn: () => getSignedVideoUrl(videoPath!),
    enabled: enabled && !!videoPath,
    staleTime: 50 * 60 * 1000,
  });
}

export function useSignedVideoDownloadUrl(
  videoPath: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ["download-url", videoPath],
    queryFn: () => getSignedVideoDownloadUrl(videoPath!),
    enabled: enabled && !!videoPath,
    staleTime: 50 * 60 * 1000,
  });
}
