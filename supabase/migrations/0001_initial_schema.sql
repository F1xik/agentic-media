-- 0001_initial_schema.sql
-- Consolidated schema for the agentic-media "fun facts" YouTube Shorts pipeline.
-- Creates the topics / videos / run_logs / app_config tables, the single-owner
-- RLS helper, row level security policies, the private "videos" Storage bucket
-- and its policies, supporting indexes, and the videos updated_at trigger.
--
-- Owner configuration (run once after applying this migration, replacing the
-- email with the owner's):
--   insert into public.app_config (id, owner_id)
--   select true, id from auth.users where email = '<owner-email>'
--   on conflict (id) do update set owner_id = excluded.owner_id;
-- Until that row exists, is_owner() returns false and every authenticated
-- session sees zero rows. The service-role key (Actions only) bypasses RLS.

-- helper: keep an updated_at column in sync on update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- single-row config table holding the owner's auth.uid().
-- the id boolean + check (id) constraint enforces at most one row.
create table public.app_config (
  id boolean primary key default true check (id),
  owner_id uuid not null
);

-- lock the table down: rls enabled with no policies means anon/authenticated
-- sessions cannot read it directly. the security-definer is_owner() function
-- below still reads it as the table owner, which bypasses rls by default.
alter table public.app_config enable row level security;

-- helper: true when the current session is the configured owner.
-- security definer + empty search_path: app_config must be fully qualified.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_config where owner_id = auth.uid()
  );
$$;

-- topics: predefined seed areas / recently-used topics to bias claude and avoid repeats.
create table public.topics (
  id bigint generated always as identity primary key,
  area text not null,
  used_count int not null default 0,
  created_at timestamptz not null default now()
);

-- videos: one row per generated video. status follows the pipeline's state machine.
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'generating'
    check (status in (
      'generating',
      'pending_review',
      'approved',
      'publishing',
      'published',
      'rejected',
      'failed'
    )),
  topic text,
  fact_text text,
  image_prompt text,
  music_track text,
  music_attribution text,
  video_path text,
  youtube_id text,
  youtube_url text,
  error text,
  run_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- run_logs: append-only per-video step log for monitoring.
create table public.run_logs (
  id bigint generated always as identity primary key,
  video_id uuid not null references public.videos (id) on delete cascade,
  step text,
  level text,
  message text,
  created_at timestamptz not null default now()
);

-- indexes: per-status filtering on videos, fk lookups on run_logs.
create index videos_status_idx on public.videos (status);
create index run_logs_video_id_idx on public.run_logs (video_id);

-- updated_at trigger for videos.
create trigger videos_set_updated_at
  before update on public.videos
  for each row
  execute function public.set_updated_at();

-- row level security: owner-only for all tables. service-role bypasses rls.
alter table public.topics enable row level security;
alter table public.videos enable row level security;
alter table public.run_logs enable row level security;

create policy topics_owner_all on public.topics
  for all using (public.is_owner()) with check (public.is_owner());

create policy videos_owner_all on public.videos
  for all using (public.is_owner()) with check (public.is_owner());

create policy run_logs_owner_all on public.run_logs
  for all using (public.is_owner()) with check (public.is_owner());

-- storage: private "videos" bucket, storing rendered mp4 files keyed as
-- {video_id}.mp4. service-role (used by GitHub Actions) bypasses RLS
-- automatically -- no policy needed for uploads from Actions. Owner policies
-- cover dashboard use: signed URL creation (select) and optional dashboard
-- upload/delete (insert, delete).
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict do nothing;

-- select: owner can list/read objects; required for createSignedUrl via anon key.
create policy videos_owner_select on storage.objects
  for select using (
    bucket_id = 'videos' and public.is_owner()
  );

-- insert: owner can upload objects from the dashboard if needed.
create policy videos_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'videos' and public.is_owner()
  );

-- delete: owner can remove objects from the dashboard if needed.
create policy videos_owner_delete on storage.objects
  for delete using (
    bucket_id = 'videos' and public.is_owner()
  );
