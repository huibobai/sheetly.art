create table if not exists public.sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_image_url text not null,
  photo_url text,
  generated_url text,
  source text not null check (source in ('photo', 'generated')),
  sticker_count integer not null check (sticker_count in (6, 9, 12)),
  sheet_size text not null check (sheet_size in ('a4', 'square')),
  background text not null,
  padding integer not null check (padding between 0 and 28),
  style text,
  created_at timestamptz not null default now()
);

alter table public.sheets enable row level security;

drop policy if exists "Users can read their sheets" on public.sheets;
drop policy if exists "Users can save their sheets" on public.sheets;

create policy "Users can read their sheets"
  on public.sheets
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can save their sheets"
  on public.sheets
  for insert
  to authenticated
  with check (auth.uid() = user_id);

grant select, insert on public.sheets to authenticated;
