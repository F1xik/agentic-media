# Task 02 — Supabase schema migration `0001`

**Plan ref:** docs/plan.md §3, §4
**Depends on:** none

## Objective
Create the initial Postgres schema, RLS, and owner helper that both pipelines
and the dashboard rely on.

## Deployment via GitHub Actions
Migrations in `supabase/migrations/` are applied automatically by
`.github/workflows/migrate.yml` when commits that touch migration files land on
`main`. The workflow needs two Actions secrets: `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_DB_PASSWORD`. `supabase/.temp/` is local CLI state only and is gitignored.

## Checklist
- [x] Add `supabase/migrations/0001_initial_schema.sql` (lower-case SQL).
- [x] `topics` table: `id, area, used_count int default 0, created_at`.
- [x] `videos` table: `id uuid pk, status text default 'generating', topic,
      fact_text, image_prompt, music_track, music_attribution, video_path,
      youtube_id, youtube_url, error, run_id, created_at, updated_at`.
- [x] `run_logs` table: `id, video_id fk, step, level, message, created_at`.
- [x] Add `public.is_owner()` helper comparing `auth.uid()` to the configured owner id.
- [x] Enable RLS on all tables: `for all using (public.is_owner())`.
- [x] Add per-status index(es) on `videos.status` and an fk index on `run_logs.video_id`.
- [x] Add an `updated_at` trigger for `videos`.
- [ ] Add `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` secrets to the repo
      (Settings → Secrets → Actions) so `migrate.yml` can run.
- [ ] Set `app.owner_id` on the database once the owner auth user is created
      (see comment at top of the migration file).

## Done when
- Tables exist in the Supabase dashboard (applied automatically by `migrate.yml`).
- A non-owner session sees zero rows; the service-role key bypasses RLS.
