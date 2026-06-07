-- 0001_initial_schema.sql
-- initial schema for the agentic-media "fun facts" youtube pipeline.
-- creates the topics / videos / run_logs tables, the single-owner rls helper,
-- row level security policies, supporting indexes, and the videos updated_at
-- trigger. see docs/plan.md sections 3 and 4 and docs/tasks/02-supabase-schema-migration.md.
--
-- owner configuration:
--   rls is keyed to a single owner. the owner's auth.uid() is read from the
--   postgres custom setting "app.owner_id". after creating the owner user in
--   supabase auth, configure it once (run as a privileged role) with e.g.:
--
--     alter database postgres set app.owner_id = '00000000-0000-0000-0000-000000000000';
--
--   until it is set, public.is_owner() returns false and every anon/authenticated
--   session sees zero rows. the service-role key bypasses rls regardless.

-- helper: true when the current session is the configured owner.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid()::text = current_setting('app.owner_id', true);
$$;

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

-- topics: predefined seed areas / recently-used topics to bias claude and avoid repeats.
create table public.topics (
  id bigint generated always as identity primary key,
  area text not null,
  used_count int not null default 0,
  created_at timestamptz not null default now()
);

-- videos: one row per generated video. status follows the state machine in plan section 3.
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
