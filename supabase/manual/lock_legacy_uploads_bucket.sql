-- MANUAL, LATER STEP. Not a migration: `supabase db push` does not run files in supabase/manual/.
-- Do NOT run until Huibo confirms, and only AFTER the PR1 code is live in production
-- (otherwise browsers still running the old code can no longer upload).
--
-- Purpose: stop anonymous writes to the old public `uploads` bucket (audit risk R2)
-- while keeping existing public URLs readable, so saved sheets still render.
--
-- 1) Inspect first. The `uploads` policies were created in the Supabase dashboard, so their
--    names are not in this repo:
--      select policyname, cmd, roles, qual, with_check
--      from pg_policies
--      where schemaname = 'storage' and tablename = 'objects'
--        and (coalesce(qual, '') || coalesce(with_check, '')) like '%''uploads''%';
--
-- 2) Drop only the INSERT / UPDATE / DELETE policies that target bucket 'uploads'
--    (reads stay public for now):
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%''uploads''::text%'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

-- 3) Even later (after copying objects still referenced by sheets into uploads_private, or
--    after a published retention period): make the bucket private.
--      update storage.buckets set public = false where id = 'uploads';
--
-- Rollback for step 2: recreate the dropped policies from the output of step 1.
