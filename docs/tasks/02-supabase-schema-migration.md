# Task 02 — Supabase schema migration `0001`

**Plan ref:** docs/plan.md §3, §4
**Depends on:** none

## Objective
Create the initial Postgres schema, RLS, and owner helper that both pipelines
and the dashboard rely on.

## Checklist
- [ ] Add `supabase/migrations/0001_initial_schema.sql` (lower-case SQL).
- [ ] `topics` table: `id, area, used_count int default 0, created_at`.
- [ ] `videos` table: `id uuid pk, status text default 'generating', topic,
      fact_text, image_prompt, music_track, music_attribution, video_path,
      youtube_id, youtube_url, error, run_id, created_at, updated_at`.
- [ ] `run_logs` table: `id, video_id fk, step, level, message, created_at`.
- [ ] Add `public.is_owner()` helper comparing `auth.uid()` to the configured owner id.
- [ ] Enable RLS on all tables: `for all using (public.is_owner())`.
- [ ] Add per-status index(es) on `videos.status` and an fk index on `run_logs.video_id`.
- [ ] Add an `updated_at` trigger for `videos`.

## Done when
- Migration applies cleanly to a fresh Supabase project.
- A non-owner session sees zero rows; the service-role key bypasses RLS.
