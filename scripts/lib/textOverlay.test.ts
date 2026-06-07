// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  escapeXml,
  wrapText,
  buildOverlaySvg,
  WIDTH,
  HEIGHT,
} from "./textOverlay.ts";

describe("escapeXml", () => {
  it("escapes the five XML special characters", () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &apos; f",
    );
  });
});

describe("wrapText", () => {
  it("wraps words into lines within the character limit", () => {
    const lines = wrapText("the quick brown fox jumps", 10);
    expect(lines).toEqual(["the quick", "brown fox", "jumps"]);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(10);
  });

  it("keeps a single over-long word on its own line", () => {
    expect(wrapText("supercalifragilistic ok", 8)).toEqual([
      "supercalifragilistic",
      "ok",
    ]);
  });

  it("collapses surrounding and repeated whitespace", () => {
    expect(wrapText("  hello   world  ", 20)).toEqual(["hello world"]);
  });

  it("returns no lines for empty input", () => {
    expect(wrapText("   ", 10)).toEqual([]);
  });
});

describe("buildOverlaySvg", () => {
  it("renders every line and a contrast band at frame size", () => {
    const lines = ["Octopuses have", "three hearts"];
    const svg = buildOverlaySvg({ lines });

    expect(svg).toContain(`width="${WIDTH}"`);
    expect(svg).toContain(`height="${HEIGHT}"`);
    expect(svg).toContain('fill-opacity="0.5"');
    for (const line of lines) expect(svg).toContain(line);
    // One <text> element per line.
    expect(svg.match(/<text /g)?.length).toBe(lines.length);
  });

  it("escapes special characters in the rendered text", () => {
    const svg = buildOverlaySvg({ lines: ["A & B < C"] });
    expect(svg).toContain("A &amp; B &lt; C");
  });
});
