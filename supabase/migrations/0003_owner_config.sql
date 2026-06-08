-- 0003_owner_config.sql
-- replaces the GUC-based owner identification with a config-table approach.
--
-- the original design (0001) keyed public.is_owner() to the postgres custom
-- setting "app.owner_id", configured via `alter database postgres set ...`.
-- on hosted supabase the project's postgres role is not a superuser and does
-- not own the postgres database, so that statement fails with
--   ERROR: 42501: permission denied to set parameter "app.owner_id"
-- and the GUC can never be set. with the owner unset, is_owner() returns false
-- and every authenticated session sees zero rows.
--
-- fix: store the owner's auth.uid() in a single-row public.app_config table and
-- rewrite is_owner() to read from it. this only needs create/insert/replace
-- privileges, which the project role does have.
--
-- owner configuration (run once, replacing the email with the owner's):
--   insert into public.app_config (id, owner_id)
--   select true, id from auth.users where email = '<owner-email>'
--   on conflict (id) do update set owner_id = excluded.owner_id;

-- single-row config table holding the owner's auth.uid().
-- the id boolean + check (id) constraint enforces at most one row.
create table if not exists public.app_config (
  id boolean primary key default true check (id),
  owner_id uuid not null
);

-- lock the table down: rls enabled with no policies means anon/authenticated
-- sessions cannot read it directly. the security-definer is_owner() function
-- below still reads it as the table owner, which bypasses rls by default.
alter table public.app_config enable row level security;

-- rewrite the owner helper to read the config table instead of the GUC.
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
