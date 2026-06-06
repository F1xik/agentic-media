# Task 07 — Videos read UI (queue + inline player)

**Plan ref:** docs/plan.md §7
**Depends on:** 03, 06

## Objective
Display the video queue grouped by status with an inline player, reading from
Supabase.

## Checklist
- [ ] Create `src/features/videos/api.ts` with `getVideos(statusFilter)` and
      `getSignedVideoUrl(videoPath)`.
- [ ] Add `useVideos.ts` (TanStack Query) for the queue.
- [ ] Build `VideosPage.tsx` grouping videos by status.
- [ ] Build `VideoCard` with inline `<video>` (signed URL), topic, fact text, and
      music attribution.
- [ ] Show a YouTube link when `youtube_url` is present.
- [ ] Seed one row manually to verify the read path end to end.

## Done when
- The dashboard lists seeded videos grouped by status and plays the mp4 via a
  signed URL.
