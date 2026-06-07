import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** Directory holding the committed royalty-free background tracks. */
export const MUSIC_DIR = join(moduleDir, "..", "..", "assets", "music");
const CREDITS_PATH = join(MUSIC_DIR, "CREDITS.md");

export type MusicTrack = {
  /** Identifier Claude selects via `music: <id>` (filename without extension). */
  id: string;
  /** On-disk filename, e.g. `carefree.mp3`. */
  filename: string;
  title: string;
  /** Mood tag (e.g. `upbeat`, `chill`) used to match a track to a video's tone. */
  mood: string;
  /** CC-BY attribution string stored in `videos.music_attribution`. */
  attribution: string;
};

/** Playable `.mp3` files present in `assets/music/`, sorted. */
export function listTrackFiles(): string[] {
  return readdirSync(MUSIC_DIR)
    .filter((f) => f.toLowerCase().endsWith(".mp3"))
    .sort();
}

/**
 * Parse `assets/music/CREDITS.md` into structured track metadata, combining the
 * table (title + mood) with the attribution list.
 */
export function parseCredits(): MusicTrack[] {
  const text = readFileSync(CREDITS_PATH, "utf8");
  const lines = text.split("\n");

  // Table rows: | `id` | Title | `mood` | Source |
  const meta = new Map<string, { title: string; mood: string }>();
  for (const line of lines) {
    const m = line.match(
      /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|/,
    );
    if (m) meta.set(m[1], { title: m[2].trim(), mood: m[3].trim() });
  }

  // Attribution list: - `id`: <attribution string>
  const tracks: MusicTrack[] = [];
  for (const line of lines) {
    const m = line.match(/^-\s*`([^`]+)`:\s*(.+)$/);
    if (!m) continue;
    const id = m[1];
    const info = meta.get(id);
    if (!info) {
      throw new Error(
        `CREDITS.md: "${id}" has an attribution but no table row`,
      );
    }
    tracks.push({
      id,
      filename: `${id}.mp3`,
      title: info.title,
      mood: info.mood,
      attribution: m[2].trim(),
    });
  }
  return tracks;
}

/** Resolve a `music:` id (with or without `.mp3`) to its attribution string. */
export function getAttribution(track: string): string {
  const id = track.replace(/\.mp3$/i, "");
  const found = parseCredits().find((t) => t.id === id);
  if (!found) throw new Error(`No music track with id "${id}"`);
  return found.attribution;
}

/** Tracks filtered by mood, or all tracks when no mood is given. */
export function tracksByMood(mood?: string): MusicTrack[] {
  const all = parseCredits();
  return mood ? all.filter((t) => t.mood === mood) : all;
}

/** Distinct mood tags available across the committed tracks, sorted. */
export function listMoods(): string[] {
  return [...new Set(parseCredits().map((t) => t.mood))].sort();
}
