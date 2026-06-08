import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/useAuth";
import { triggerGenerate } from "./api";

export function useGenerateVideo() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Not authenticated");
      await triggerGenerate(session.access_token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["videos"] }),
  });
}
