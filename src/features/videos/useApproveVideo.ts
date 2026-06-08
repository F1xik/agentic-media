import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/useAuth";
import { approveVideo, rejectVideo, triggerPublish } from "./api";

export function useApproveVideo() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await approveVideo(id);
      if (!session) throw new Error("Not authenticated");
      await triggerPublish(session.access_token, id);
    },
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
