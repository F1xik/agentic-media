import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VideoCard } from "./VideoCard";
import { type Video } from "./api";

vi.mock("../../lib/supabase", () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

vi.mock("./useVideos", () => ({
  useSignedVideoUrl: () => ({ data: "https://signed", isLoading: false }),
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
});
