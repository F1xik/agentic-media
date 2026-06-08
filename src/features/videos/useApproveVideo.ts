import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approveVideo, rejectVideo } from "./api";

export function useApproveVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveVideo,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["videos"] }),
  });
}

export function useRejectVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rejectVideo,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["videos"] }),
  });
}
