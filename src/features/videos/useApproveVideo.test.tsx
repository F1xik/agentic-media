import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { AuthContext } from "../auth/context";
import { useApproveVideo } from "./useApproveVideo";

const { mockApproveVideo, mockTriggerPublish } = vi.hoisted(() => ({
  mockApproveVideo: vi.fn(),
  mockTriggerPublish: vi.fn(),
}));

vi.mock("./api", () => ({
  approveVideo: mockApproveVideo,
  triggerPublish: mockTriggerPublish,
}));

const session = { access_token: "tok-abc" } as Session;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={{ session, loading: false }}>
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useApproveVideo", () => {
  it("approves then dispatches publish for the video", async () => {
    mockApproveVideo.mockResolvedValue(undefined);
    mockTriggerPublish.mockResolvedValue(undefined);

    const { result } = renderHook(() => useApproveVideo(), { wrapper });
    result.current.mutate("vid-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApproveVideo).toHaveBeenCalledWith("vid-1");
    expect(mockTriggerPublish).toHaveBeenCalledWith("tok-abc", "vid-1");
  });

  it("surfaces the dispatch error", async () => {
    mockApproveVideo.mockResolvedValue(undefined);
    mockTriggerPublish.mockRejectedValue(new Error("dispatch boom"));

    const { result } = renderHook(() => useApproveVideo(), { wrapper });
    result.current.mutate("vid-1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("dispatch boom");
  });
});
