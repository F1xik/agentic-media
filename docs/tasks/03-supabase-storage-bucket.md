# Task 03 — Supabase Storage bucket for videos

**Plan ref:** docs/plan.md §4
**Depends on:** 02

## Objective
Provide a private bucket for rendered mp4s that the pipeline writes to and the
dashboard reads via short-lived signed URLs.

## Checklist
- [ ] Create a **private** Storage bucket `videos/` — either via a SQL migration
      (auto-deployed by the Supabase GitHub integration on push to `main`) or directly
      in the Supabase dashboard. A migration is preferred so the bucket is reproducible.
- [ ] Establish the object key convention `{video_id}.mp4`.
- [ ] Confirm the service-role key can upload objects (used by Actions).
- [ ] Confirm the dashboard can mint a short-lived signed URL for playback (no public read).

## Done when
- Bucket exists and is private.
- A service-role upload succeeds and an anon signed URL plays the object; direct
  public access is denied.
