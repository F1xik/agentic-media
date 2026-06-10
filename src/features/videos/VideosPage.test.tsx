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
    // No topic typed → undefined so the pipeline uses its trending pick.
    expect(mockGenerate).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it("passes a typed topic to the mutation", () => {
    mockUseVideos.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<VideosPage />);
    fireEvent.change(screen.getByLabelText("Video topic"), {
      target: { value: "  deep sea creatures  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate now" }));
    expect(mockGenerate).toHaveBeenCalledWith(
      "deep sea creatures",
      expect.anything(),
    );
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
