import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { AuthContext } from "../auth/context";
import { useGenerateVideo } from "./useGenerateVideo";

const { mockTriggerGenerate } = vi.hoisted(() => ({
  mockTriggerGenerate: vi.fn(),
}));

vi.mock("./api", () => ({
  triggerGenerate: mockTriggerGenerate,
}));

const session = { access_token: "tok-abc" } as Session;

function makeWrapper(value: { session: Session | null; loading: boolean }) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    return (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useGenerateVideo", () => {
  it("dispatches a generate run with the session token", async () => {
    mockTriggerGenerate.mockResolvedValue(undefined);

    const { result } = renderHook(() => useGenerateVideo(), {
      wrapper: makeWrapper({ session, loading: false }),
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockTriggerGenerate).toHaveBeenCalledWith("tok-abc");
  });

  it("errors when there is no session", async () => {
    const { result } = renderHook(() => useGenerateVideo(), {
      wrapper: makeWrapper({ session: null, loading: false }),
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Not authenticated");
    expect(mockTriggerGenerate).not.toHaveBeenCalled();
  });
});
