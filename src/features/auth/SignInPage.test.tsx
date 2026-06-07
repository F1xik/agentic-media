import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignInPage } from "./SignInPage";

const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("./api", () => ({
  signIn: vi.fn(),
}));

import { signIn } from "./api";

beforeEach(() => {
  vi.clearAllMocks();
});

function setup() {
  return render(
    <MemoryRouter>
      <SignInPage />
    </MemoryRouter>,
  );
}

describe("SignInPage", () => {
  it("renders email field, password field, and sign-in button", () => {
    setup();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("calls signIn with email and password on submit", async () => {
    vi.mocked(signIn).mockResolvedValue(undefined);
    setup();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith("user@example.com", "password123");
    });
  });

  it("navigates to / on successful sign-in", async () => {
    vi.mocked(signIn).mockResolvedValue(undefined);
    setup();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("shows error message on failed sign-in", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("Invalid login credentials"));
    setup();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrongpassword" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Invalid login credentials"),
    ).toBeInTheDocument();
  });

  it("does not navigate on failed sign-in", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("Invalid login credentials"));
    setup();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrongpassword" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByText("Invalid login credentials");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
