-- PR1: private bucket for photo uploads.
-- Written only; NOT executed. Run on the test project first, then production,
-- BEFORE deploying the PR1 code (the new code uploads to this bucket).
--
-- Why a NEW bucket instead of flipping `uploads` to private:
-- sheets saved before PR1 store public URLs of `uploads` objects. Making `uploads` private
-- now would break every saved sheet and the photos already referenced in it. This migration
-- leaves `uploads` untouched. Locking down `uploads` is a separate, later step
-- (see supabase/manual/lock_legacy_uploads_bucket.sql) once old data is migrated or expired.
--
-- Rollback: drop the three policies below and delete the bucket (only if it is empty):
--   drop policy if exists "uploads_private: owner can upload" on storage.objects;
--   drop policy if exists "uploads_private: owner can read" on storage.objects;
--   drop policy if exists "uploads_private: owner can delete" on storage.objects;
--   delete from storage.buckets where id = 'uploads_private';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads_private',
  'uploads_private',
  false,
  10485760, -- 10 MB, same limit as the client-side check in components/PhotoUpload.tsx
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "uploads_private: owner can upload" on storage.objects;
drop policy if exists "uploads_private: owner can read" on storage.objects;
drop policy if exists "uploads_private: owner can delete" on storage.objects;

-- Signed-in users may only create objects at `{auth.uid()}/{file}.{jpg|png|webp}`.
-- Size and MIME type are enforced by the bucket settings above.
create policy "uploads_private: owner can upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'uploads_private'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
  );

-- Read (download / create signed URL) and delete only inside your own folder.
create policy "uploads_private: owner can read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'uploads_private'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "uploads_private: owner can delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'uploads_private'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- No update policy: uploads are write-once (the client sends x-upsert: false).
