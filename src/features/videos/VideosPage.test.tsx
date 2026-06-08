import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VideosPage } from "./VideosPage";

const { mockUseVideos, mockGenerate } = vi.hoisted(() => ({
  mockUseVideos: vi.fn(),
  mockGenerate: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

vi.mock("./useVideos", () => ({
  useVideos: mockUseVideos,
}));

vi.mock("./useGenerateVideo", () => ({
  useGenerateVideo: () => ({
    mutate: mockGenerate,
    isPending: false,
    error: null,
  }),
}));

vi.mock("./VideoCard", () => ({
  VideoCard: () => <div data-testid="video-card" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VideosPage", () => {
  it("renders the Generate now button and fires the mutation on click", () => {
    mockUseVideos.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<VideosPage />);
    const button = screen.getByRole("button", { name: "Generate now" });
    fireEvent.click(button);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("shows the Generate now button even while loading", () => {
    mockUseVideos.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<VideosPage />);
    expect(
      screen.getByRole("button", { name: "Generate now" }),
    ).toBeInTheDocument();
  });
});
