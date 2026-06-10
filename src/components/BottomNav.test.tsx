import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, it, expect } from "vitest";
import { BottomNav } from "./BottomNav";

describe("BottomNav", () => {
  it("renders all five tabs with the correct hrefs", () => {
    render(
      <MemoryRouter initialEntries={["/pending"]}>
        <BottomNav />
      </MemoryRouter>,
    );

    const expected: [string, string][] = [
      ["Generate", "/generate"],
      ["Pending", "/pending"],
      ["Approved", "/approved"],
      ["Rejected", "/rejected"],
      ["Generating", "/generating"],
    ];

    for (const [label, href] of expected) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", href);
    }
  });

  it("marks the active tab with aria-current", () => {
    render(
      <MemoryRouter initialEntries={["/approved"]}>
        <BottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Approved" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
