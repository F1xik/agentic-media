import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VideoCard } from "./VideoCard";
import { type Video } from "./api";

vi.mock("../../lib/supabase", () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

// Honor the `enabled` flag so the tests can assert that signed URLs are only
// requested on demand (the egress fix), not for every card on render.
vi.mock("./useVideos", () => ({
  useSignedVideoUrl: (_path: string | null, enabled = true) => ({
    data: enabled ? "https://signed" : undefined,
    isLoading: false,
  }),
  useSignedVideoDownloadUrl: (_path: string | null, enabled = true) => ({
    data: enabled ? "https://signed-download" : undefined,
  }),
}));

const mockApprove = vi.fn();
const mockReject = vi.fn();

vi.mock("./useApproveVideo", () => ({
  useApproveVideo: () => ({
    mutate: mockApprove,
    isPending: false,
    error: null,
  }),
  useRejectVideo: () => ({
    mutate: mockReject,
    isPending: false,
    error: null,
  }),
}));

const baseVideo: Video = {
  id: "vid-1",
  status: "pending_review",
  topic: "Space",
  fact_text: "A fun fact.",
  image_prompt: null,
  music_track: null,
  music_attribution: null,
  video_path: "vid-1.mp4",
  youtube_id: null,
  youtube_url: null,
  error: null,
  run_id: null,
  created_at: "2026-06-08T00:00:00.000Z",
  updated_at: "2026-06-08T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VideoCard", () => {
  it("shows Approve and Reject buttons for pending_review", () => {
    render(<VideoCard video={baseVideo} />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("does not show controls for a non-pending_review status", () => {
    render(<VideoCard video={{ ...baseVideo, status: "published" }} />);
    expect(
      screen.queryByRole("button", { name: "Approve" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reject" }),
    ).not.toBeInTheDocument();
  });

  it("calls the approve mutation with the video id", () => {
    render(<VideoCard video={baseVideo} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(mockApprove).toHaveBeenCalledWith("vid-1");
  });

  it("calls the reject mutation with the video id", () => {
    render(<VideoCard video={baseVideo} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(mockReject).toHaveBeenCalledWith("vid-1");
  });

  it("does not load the video until Play is clicked, then fetches it once", () => {
    const { container } = render(<VideoCard video={baseVideo} />);
    // No <video> (and so no signed-URL fetch) on initial render.
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByRole("button", { name: "▶ Play" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "▶ Play" }));
    const player = container.querySelector("video");
    expect(player).not.toBeNull();
    expect(player).toHaveAttribute("src", "https://signed");
  });

  it("mints the download URL only after the user signals intent", () => {
    render(<VideoCard video={baseVideo} />);
    const link = screen.getByText("Download");
    // Disabled (no href) until armed, so no signed URL is requested on render.
    expect(link).not.toHaveAttribute("href");

    fireEvent.mouseEnter(link);
    expect(link).toHaveAttribute("href", "https://signed-download");
  });

  it("does not show a Download link when there is no video_path", () => {
    render(<VideoCard video={{ ...baseVideo, video_path: null }} />);
    expect(screen.queryByText("Download")).not.toBeInTheDocument();
  });
});
