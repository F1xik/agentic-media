import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VideoListPage } from "./VideoListPage";
import { TABS } from "./tabs";

const { mockUseVideos } = vi.hoisted(() => ({
  mockUseVideos: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

vi.mock("./useVideos", () => ({
  useVideos: mockUseVideos,
}));

vi.mock("./VideoCard", () => ({
  VideoCard: () => <div data-testid="video-card" />,
}));

const approvedTab = TABS.find((t) => t.key === "approved")!;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VideoListPage", () => {
  it("queries with the tab's folded status group", () => {
    mockUseVideos.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<VideoListPage tab={approvedTab} />);
    expect(mockUseVideos).toHaveBeenCalledWith([
      "approved",
      "publishing",
      "published",
    ]);
  });

  it("renders a card per video", () => {
    mockUseVideos.mockReturnValue({
      data: [
        { id: "1", status: "approved" },
        { id: "2", status: "published" },
      ],
      isLoading: false,
      isError: false,
    });

    render(<VideoListPage tab={approvedTab} />);
    expect(screen.getAllByTestId("video-card")).toHaveLength(2);
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("shows an empty state when there are no videos", () => {
    mockUseVideos.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<VideoListPage tab={approvedTab} />);
    expect(screen.getByText("No Approved videos")).toBeInTheDocument();
  });

  it("shows an error state when the query fails", () => {
    mockUseVideos.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<VideoListPage tab={approvedTab} />);
    expect(screen.getByText("Failed to load videos.")).toBeInTheDocument();
  });
});
