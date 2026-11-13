-- Print review columns on public.sheets.
-- Written only. NOT executed. Huibo runs it on staging first, then production.
--
-- There is no print-and-deliver flow yet. These columns are the gate for when it exists.
-- No sheet may be sent to print unless review_status = 'approved'.
--
-- Users cannot set the columns:
--   1. authenticated and anon lose table-level INSERT, then get INSERT only on the
--      columns the app already writes. review_status, reviewed_at, and reviewed_by
--      are not in that list, so naming them in an insert is denied.
--   2. A BEFORE INSERT/UPDATE trigger forces the defaults for anon and authenticated
--      JWTs, including if a later migration grants table-level UPDATE.
-- A reviewer uses a database role whose JWT role is not anon or authenticated
-- (service_role, or SQL as the table owner, where auth.role() is null).

alter table public.sheets
  add column if not exists review_status text not null default 'unreviewed';

alter table public.sheets
  add column if not exists reviewed_at timestamptz;

alter table public.sheets
  add column if not exists reviewed_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sheets_review_status_check'
      and conrelid = 'public.sheets'::regclass
  ) then
    alter table public.sheets
      add constraint sheets_review_status_check
      check (review_status in ('unreviewed', 'approved', 'rejected'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sheets_reviewed_by_fkey'
      and conrelid = 'public.sheets'::regclass
  ) then
    alter table public.sheets
      add constraint sheets_reviewed_by_fkey
      foreign key (reviewed_by) references auth.users (id) on delete set null;
  end if;
end $$;

comment on column public.sheets.review_status is
  'Print gate. No sheet may be sent to print unless review_status = ''approved''. Allowed: unreviewed, approved, rejected. Clients cannot set this.';

comment on column public.sheets.reviewed_at is
  'When a reviewer set review_status. Null while unreviewed. Clients cannot set this.';

comment on column public.sheets.reviewed_by is
  'auth.users id of the reviewer. Clients cannot set this.';

-- Table-level INSERT would still allow the new columns. Replace it with a column list
-- that matches the columns the app writes today. Run after the items column exists.
revoke insert on table public.sheets from anon, authenticated;

grant insert (
  id,
  user_id,
  source_image_url,
  photo_url,
  generated_url,
  source,
  sticker_count,
  sheet_size,
  background,
  padding,
  style,
  created_at,
  items
) on table public.sheets to authenticated;

revoke update on table public.sheets from anon, authenticated;

create or replace function public.protect_sheet_review_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- No sheet may be sent to print unless review_status = 'approved'.
  -- API roles cannot choose that value. service_role and a SQL session with no JWT can.
  if auth.role() in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.review_status := 'unreviewed';
      new.reviewed_at := null;
      new.reviewed_by := null;
    else
      new.review_status := old.review_status;
      new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_sheet_review_columns() from public, anon, authenticated;

drop trigger if exists sheets_protect_review_columns on public.sheets;

create trigger sheets_protect_review_columns
  before insert or update on public.sheets
  for each row
  execute function public.protect_sheet_review_columns();
