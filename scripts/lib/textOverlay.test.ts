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

  it("renders only the fact block (one band) when no hook is given", () => {
    const svg = buildOverlaySvg({ lines: ["Octopuses have", "three hearts"] });
    expect(svg.match(/<rect /g)?.length).toBe(1);
  });

  it("renders the hook above the fact, each with its own band", () => {
    const hookLines = ["Why do octopuses", "never faint?"];
    const lines = ["Octopuses have", "three hearts"];
    const svg = buildOverlaySvg({ hookLines, lines });

    for (const line of [...hookLines, ...lines]) expect(svg).toContain(line);
    // Two contrast bands: one for the hook, one for the fact.
    expect(svg.match(/<rect /g)?.length).toBe(2);
    // A <text> element per hook line plus per fact line.
    expect(svg.match(/<text /g)?.length).toBe(hookLines.length + lines.length);
  });

  it("fits the band to the text instead of spanning the full frame width", () => {
    const lines = ["Octopuses have", "three hearts"];
    const svg = buildOverlaySvg({ lines });

    const rect = svg.match(
      /<rect x="(\d+)"[^>]*width="(\d+)"[^>]*rx="(\d+)" ry="(\d+)"/,
    );
    expect(rect).not.toBeNull();
    const [bandX, bandWidth, rx, ry] = [
      Number(rect![1]),
      Number(rect![2]),
      Number(rect![3]),
      Number(rect![4]),
    ];
    // Narrower than the frame and inset from the left edge.
    expect(bandWidth).toBeLessThan(WIDTH);
    expect(bandX).toBeGreaterThan(0);
    // Horizontally centered: left margin equals the right margin.
    expect(bandX).toBe(Math.round((WIDTH - bandWidth) / 2));
    // Rounded corners.
    expect(rx).toBeGreaterThan(0);
    expect(ry).toBeGreaterThan(0);
  });

  it("sizes the band wide enough not to clip the longest line", () => {
    const lines = ["Octopuses have", "three hearts"];
    const svg = buildOverlaySvg({ lines });
    const bandWidth = Number(svg.match(/<rect [^>]*width="(\d+)"/)![1]);
    // Widest line (14 chars) at fontSize 64, ~0.6 advance ratio ≈ 538px of text.
    const estimatedTextWidth = "Octopuses have".length * 64 * 0.6;
    expect(bandWidth).toBeGreaterThanOrEqual(estimatedTextWidth);
  });

  it("scales the fact font down when the fact is too tall, but not for short facts", () => {
    const fontSize = (svg: string) =>
      Number(svg.match(/<text [^>]*font-size="(\d+)"/)![1]);

    const shortSvg = buildOverlaySvg({
      lines: ["Octopuses have", "three hearts"],
    });
    // A short fact keeps the default 64px font.
    expect(fontSize(shortSvg)).toBe(64);

    // A long fact (many wrapped lines) exceeds the height cap and is scaled down.
    const longLines = Array.from({ length: 14 }, (_, i) => `fact line ${i}`);
    const longSvg = buildOverlaySvg({ lines: longLines });
    expect(fontSize(longSvg)).toBeLessThan(64);

    // The scaled fact band is far shorter than the unscaled block would be and
    // stays near the height cap (~42% of the frame, plus band padding).
    const bandHeight = Number(longSvg.match(/<rect [^>]*height="(\d+)"/)![1]);
    expect(bandHeight).toBeLessThan(longLines.length * 84);
    expect(bandHeight).toBeLessThanOrEqual(
      Math.round(HEIGHT * 0.42) + 2 * 48 + 16,
    );
  });

  it("keeps the fact band clear of the hook band for a long hook + long fact", () => {
    // A 4-line hook and an 8-line fact: centering the fact would otherwise pull
    // its band up over the last hook line and mute it.
    const hookLines = [
      "What tiny creature",
      "can survive in the",
      "vacuum of outer",
      "space?",
    ];
    const lines = [
      "Tardigrades can",
      "survive in open space,",
      "enduring radiation,",
      "vacuum, and extreme",
      "temperatures by",
      "entering a dried,",
      "near-dead state called",
      "cryptobiosis.",
    ];
    const svg = buildOverlaySvg({ hookLines, lines });

    // The hook band is rendered first, the fact band second.
    const rects = [...svg.matchAll(/<rect [^>]*y="(\d+)"[^>]*height="(\d+)"/g)];
    expect(rects.length).toBe(2);
    const [hookY, hookH] = [Number(rects[0][1]), Number(rects[0][2])];
    const factY = Number(rects[1][1]);
    // The fact band starts at or below the bottom of the hook band — no overlap.
    expect(factY).toBeGreaterThanOrEqual(hookY + hookH);
  });
});
