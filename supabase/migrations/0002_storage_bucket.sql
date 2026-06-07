-- 0002_storage_bucket.sql
-- creates the private "videos" storage bucket and rls policies on storage.objects.
-- the bucket stores rendered mp4 files keyed as {video_id}.mp4.
-- service-role (used by github actions) bypasses rls automatically -- no policy needed
-- for uploads from actions. owner policies cover dashboard use: signed url creation
-- (select) and optional dashboard upload/delete (insert, delete).
-- see docs/tasks/03-supabase-storage-bucket.md.

-- bucket: private, id and name both "videos".
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict do nothing;

-- rls policies on storage.objects for bucket_id = 'videos'.
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
