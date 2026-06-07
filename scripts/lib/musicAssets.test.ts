// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  listTrackFiles,
  parseCredits,
  getAttribution,
  tracksByMood,
  listMoods,
} from "./musicAssets.ts";

describe("music assets", () => {
  it("commits at least 3 playable tracks", () => {
    const files = listTrackFiles();
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.every((f) => f.endsWith(".mp3"))).toBe(true);
  });

  it("every .mp3 file has a complete CREDITS entry", () => {
    const fileIds = listTrackFiles().map((f) => f.replace(/\.mp3$/, ""));
    const credited = parseCredits();
    const creditedIds = credited.map((t) => t.id);

    for (const id of fileIds) {
      expect(creditedIds).toContain(id);
    }

    for (const track of credited) {
      expect(track.title.length).toBeGreaterThan(0);
      expect(track.mood.length).toBeGreaterThan(0);
      expect(track.attribution.length).toBeGreaterThan(0);
      // CC-BY requires the licence link in the attribution.
      expect(track.attribution).toContain("creativecommons.org/licenses/by");
    }
  });

  it("every CREDITS entry maps to a real file (no drift)", () => {
    const files = new Set(listTrackFiles());
    for (const track of parseCredits()) {
      expect(files.has(track.filename)).toBe(true);
    }
  });

  it("resolves attribution with and without the .mp3 extension", () => {
    const first = parseCredits()[0];
    expect(getAttribution(first.id)).toBe(first.attribution);
    expect(getAttribution(first.filename)).toBe(first.attribution);
  });

  it("throws for an unknown track id", () => {
    expect(() => getAttribution("does-not-exist")).toThrow(/no music track/i);
  });

  it("filters tracks by mood and lists available moods", () => {
    const moods = listMoods();
    expect(moods.length).toBeGreaterThan(0);

    expect(tracksByMood()).toEqual(parseCredits());

    for (const mood of moods) {
      const tracks = tracksByMood(mood);
      expect(tracks.length).toBeGreaterThan(0);
      expect(tracks.every((t) => t.mood === mood)).toBe(true);
    }

    expect(tracksByMood("no-such-mood")).toEqual([]);
  });
});
