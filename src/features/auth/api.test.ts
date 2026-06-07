import { describe, it, expect, vi, beforeEach } from "vitest";
import { signIn, signOut } from "./api";

const { mockSignInWithPassword, mockSignOut } = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signIn", () => {
  it("calls signInWithPassword with email and password", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });
    await signIn("user@example.com", "password123");
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    });
  });

  it("throws on error", async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: new Error("Invalid login credentials"),
    });
    await expect(signIn("user@example.com", "wrong")).rejects.toThrow(
      "Invalid login credentials",
    );
  });
});

describe("signOut", () => {
  it("calls supabase signOut", async () => {
    mockSignOut.mockResolvedValue({ error: null });
    await signOut();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("throws on error", async () => {
    mockSignOut.mockResolvedValue({ error: new Error("sign out failed") });
    await expect(signOut()).rejects.toThrow("sign out failed");
  });
});
