// Pure helpers for compositing the fact text onto the background image.
// The text is rendered as an SVG overlay (drawn by sharp) rather than via
// ffmpeg `drawtext`, which dodges font-path and escaping pitfalls.

/** Portrait Shorts frame dimensions. */
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** Escape the five XML special characters so arbitrary text is safe in SVG. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Greedy word-wrap into lines of at most `maxCharsPerLine` characters. Words
 * longer than the limit are kept intact on their own line (never split).
 */
export function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current === "") {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

export type OverlayOptions = {
  lines: string[];
  width?: number;
  height?: number;
  fontSize?: number;
  lineHeight?: number;
};

/**
 * Build a full-frame SVG with a semi-transparent contrast band behind the
 * vertically-centered, wrapped fact text. Returned as a UTF-8 SVG string for
 * sharp to composite over the background.
 */
export function buildOverlaySvg({
  lines,
  width = WIDTH,
  height = HEIGHT,
  fontSize = 64,
  lineHeight = 84,
}: OverlayOptions): string {
  const blockHeight = lines.length * lineHeight;
  // Vertically center the text block, then place the band a little around it.
  const blockTop = Math.round((height - blockHeight) / 2);
  const bandPadding = 48;
  const bandY = Math.max(0, blockTop - bandPadding);
  const bandHeight = Math.min(height - bandY, blockHeight + bandPadding * 2);
  // Baseline of the first line (text anchored at its baseline in SVG).
  const firstBaseline = blockTop + fontSize;

  const tspans = lines
    .map((line, i) => {
      const y = firstBaseline + i * lineHeight;
      return `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff" stroke="#000000" stroke-width="2" paint-order="stroke">${escapeXml(
        line,
      )}</text>`;
    })
    .join("");

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${bandY}" width="${width}" height="${bandHeight}" fill="#000000" fill-opacity="0.5"/>
  ${tspans}
</svg>`;
}
