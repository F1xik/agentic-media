import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeneratePage } from "./GeneratePage";

const { mockGenerate } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
}));

vi.mock("./useGenerateVideo", () => ({
  useGenerateVideo: () => ({
    mutate: mockGenerate,
    isPending: false,
    error: null,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GeneratePage", () => {
  it("renders the Generate now button and fires the mutation on click", () => {
    render(<GeneratePage />);
    const button = screen.getByRole("button", { name: "Generate now" });
    fireEvent.click(button);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    // No topic typed → undefined so the pipeline uses its trending pick.
    expect(mockGenerate).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it("passes a trimmed topic to the mutation", () => {
    render(<GeneratePage />);
    fireEvent.change(screen.getByLabelText("Video topic"), {
      target: { value: "  deep sea creatures  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate now" }));
    expect(mockGenerate).toHaveBeenCalledWith(
      "deep sea creatures",
      expect.anything(),
    );
  });
});
