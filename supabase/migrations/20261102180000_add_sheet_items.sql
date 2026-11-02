alter table public.sheets
  add column if not exists items jsonb;

comment on column public.sheets.items is
  'Every photo on the sheet: photoUrl, imageUrl, and style.';
