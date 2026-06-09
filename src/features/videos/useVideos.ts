import { useQuery } from "@tanstack/react-query";
import {
  getVideos,
  getSignedVideoUrl,
  getSignedVideoDownloadUrl,
  type VideoStatus,
} from "./api";

export function useVideos(statusFilter?: VideoStatus) {
  return useQuery({
    queryKey: ["videos", statusFilter ?? null],
    queryFn: () => getVideos(statusFilter),
  });
}

export function useSignedVideoUrl(videoPath: string | null) {
  return useQuery({
    queryKey: ["signed-url", videoPath],
    queryFn: () => getSignedVideoUrl(videoPath!),
    enabled: !!videoPath,
    staleTime: 50 * 60 * 1000,
  });
}

export function useSignedVideoDownloadUrl(videoPath: string | null) {
  return useQuery({
    queryKey: ["download-url", videoPath],
    queryFn: () => getSignedVideoDownloadUrl(videoPath!),
    enabled: !!videoPath,
    staleTime: 50 * 60 * 1000,
  });
}
