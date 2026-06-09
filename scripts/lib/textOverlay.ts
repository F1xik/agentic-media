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
  /** Optional hook lines, rendered larger near the top of the frame. */
  hookLines?: string[];
  width?: number;
  height?: number;
  fontSize?: number;
  lineHeight?: number;
  hookFontSize?: number;
  hookLineHeight?: number;
};

type BlockOptions = {
  lines: string[];
  width: number;
  /** Top of the text block (the band is padded around it). */
  blockTop: number;
  fontSize: number;
  lineHeight: number;
  height: number;
  /** Text fill colour (the hook uses an accent to draw the eye first). */
  fill?: string;
};

/** Padding around a text block, both inside its contrast band and as layout gap. */
const BAND_PADDING = 48;

/** Minimum vertical gap between the hook band and the fact band below it. */
const BLOCK_GAP = 24;

/** Approximate advance width of an Arial Bold glyph as a fraction of the font
 *  size. Used to size the band to the text; a slight overestimate so the band
 *  never clips a wide line. */
const CHAR_WIDTH_RATIO = 0.6;

/** Corner radius of the contrast band so the fitted band reads as a caption
 *  pill rather than a hard-edged bar. */
const BAND_CORNER_RADIUS = 24;

/** Estimated rendered width of the widest line in a block (in px). */
function maxLineWidth(lines: string[], fontSize: number): number {
  const longest = lines.reduce((n, l) => Math.max(n, l.length), 0);
  return longest * fontSize * CHAR_WIDTH_RATIO;
}

/**
 * Geometry of the contrast band drawn behind a text block: where it starts, how
 * wide, and how tall. The band hugs the text — its width is the widest line plus
 * padding (centered, never wider than the frame) — so it covers only what the
 * text needs and leaves the rest of the photo visible. Shared by `renderBlock`
 * (to draw the band) and `buildOverlaySvg` (to keep blocks from overlapping).
 */
function bandGeometry(
  blockTop: number,
  lines: string[],
  fontSize: number,
  lineHeight: number,
  width: number,
  height: number,
): { bandX: number; bandY: number; bandWidth: number; bandHeight: number } {
  const blockHeight = lines.length * lineHeight;
  const bandY = Math.max(0, blockTop - BAND_PADDING);
  const bandHeight = Math.min(height - bandY, blockHeight + BAND_PADDING * 2);
  const bandWidth = Math.round(
    Math.min(width, maxLineWidth(lines, fontSize) + BAND_PADDING * 2),
  );
  const bandX = Math.max(0, Math.round((width - bandWidth) / 2));
  return { bandX, bandY, bandWidth, bandHeight };
}

/**
 * Render one block: a semi-transparent contrast band plus the wrapped, outlined
 * lines anchored over it. Returns the SVG fragment (band + text elements).
 */
function renderBlock({
  lines,
  width,
  blockTop,
  fontSize,
  lineHeight,
  height,
  fill = "#ffffff",
}: BlockOptions): string {
  if (lines.length === 0) return "";

  const { bandX, bandY, bandWidth, bandHeight } = bandGeometry(
    blockTop,
    lines,
    fontSize,
    lineHeight,
    width,
    height,
  );
  // Baseline of the first line (text anchored at its baseline in SVG).
  const firstBaseline = blockTop + fontSize;

  const tspans = lines
    .map((line, i) => {
      const y = firstBaseline + i * lineHeight;
      return `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="${fill}" stroke="#000000" stroke-width="2" paint-order="stroke">${escapeXml(
        line,
      )}</text>`;
    })
    .join("");

  return `<rect x="${bandX}" y="${bandY}" width="${bandWidth}" height="${bandHeight}" rx="${BAND_CORNER_RADIUS}" ry="${BAND_CORNER_RADIUS}" fill="#000000" fill-opacity="0.5"/>
  ${tspans}`;
}

/** Fraction of the frame height the fact block may occupy before its font is
 *  scaled down. A long fact would otherwise grow a band that blankets the
 *  middle of the frame; capping the height keeps more of the photo visible. */
const FACT_MAX_HEIGHT_RATIO = 0.42;

/**
 * Build a full-frame SVG that composites the fact text (vertically centered)
 * and, when provided, a larger accent-coloured hook near the top — each behind
 * its own semi-transparent contrast band. Returned as a UTF-8 SVG string for
 * sharp to composite over the background.
 */
export function buildOverlaySvg({
  lines,
  hookLines = [],
  width = WIDTH,
  height = HEIGHT,
  fontSize = 64,
  lineHeight = 84,
  hookFontSize = 76,
  hookLineHeight = 96,
}: OverlayOptions): string {
  // Cap the fact block's height: a long fact scales its font (and line height)
  // down proportionally so its band never blankets the middle of the frame.
  const maxFactHeight = height * FACT_MAX_HEIGHT_RATIO;
  const naturalFactHeight = lines.length * lineHeight;
  const factScale =
    naturalFactHeight > maxFactHeight ? maxFactHeight / naturalFactHeight : 1;
  const factFontSize = Math.round(fontSize * factScale);
  const factLineHeight = Math.round(lineHeight * factScale);

  // Hook block: anchored in the upper portion of the frame, in an accent colour.
  const hookTop = Math.round(height * 0.14);
  const hook = renderBlock({
    lines: hookLines,
    width,
    blockTop: hookTop,
    fontSize: hookFontSize,
    lineHeight: hookLineHeight,
    height,
    fill: "#ffe14d",
  });

  // Fact block: vertically centered, but never overlapping the hook band — a
  // long hook + long fact would otherwise let the fact's contrast band paint
  // over (and mute) the last hook line. Clamp the fact below the hook band.
  const centeredTop = Math.round((height - lines.length * factLineHeight) / 2);
  let factTop = centeredTop;
  if (hookLines.length > 0) {
    const { bandY, bandHeight } = bandGeometry(
      hookTop,
      hookLines,
      hookFontSize,
      hookLineHeight,
      width,
      height,
    );
    const minFactTop = bandY + bandHeight + BAND_PADDING + BLOCK_GAP;
    factTop = Math.max(centeredTop, minFactTop);
  }
  const fact = renderBlock({
    lines,
    width,
    blockTop: factTop,
    fontSize: factFontSize,
    lineHeight: factLineHeight,
    height,
  });

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${hook}
  ${fact}
</svg>`;
}
