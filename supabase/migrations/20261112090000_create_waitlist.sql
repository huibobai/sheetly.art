-- Pre-launch waitlist.
-- Written only; NOT executed. Run this on the staging project first.
-- Production only with Huibo's OK.
-- Nothing in this file was applied from the agent environment.
--
-- public.waitlist stores an email, when it was added, which form sent it
-- (homepage or waitlist), and that the person ticked consent. Email is unique.
-- anon and authenticated may INSERT and nothing else. There is no SELECT,
-- UPDATE, or DELETE policy, and those privileges are revoked, so a browser
-- client cannot read the list.
--
-- public.waitlist_ip_events and consume_waitlist_ip_quota count signup
-- attempts per IP the same way guest AI limits count generations. The events
-- table has no policies. Only the function writes it. /api/waitlist passes
-- the visitor IP it read from the proxy headers (lib/client-ip.ts).
-- A direct insert into public.waitlist with the anon key does not go through
-- that counter. The form on the site posts to the API route, which does.
-- The route does not send email.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now(),
  source text not null,
  consent boolean not null,
  constraint waitlist_email_unique unique (email),
  constraint waitlist_email_shape check (
    char_length(email) between 5 and 254
    and email = lower(email)
    and position('@' in email) > 1
  ),
  constraint waitlist_consent_required check (consent),
  constraint waitlist_source_known check (source in ('homepage', 'waitlist'))
);

create or replace function public.waitlist_normalize_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

revoke all on function public.waitlist_normalize_email() from public;
grant execute on function public.waitlist_normalize_email() to anon, authenticated;

drop trigger if exists waitlist_normalize_email on public.waitlist;
create trigger waitlist_normalize_email
  before insert or update on public.waitlist
  for each row
  execute function public.waitlist_normalize_email();

alter table public.waitlist enable row level security;
alter table public.waitlist force row level security;

-- New tables in this project are granted to anon and authenticated by default.
-- Remove that, then allow insert only.
revoke all on table public.waitlist from public, anon, authenticated;
grant insert on table public.waitlist to anon, authenticated;

drop policy if exists "waitlist: insert only" on public.waitlist;
create policy "waitlist: insert only"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (consent is true);

create table if not exists public.waitlist_ip_events (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_ip_events_ip_created_idx
  on public.waitlist_ip_events (ip, created_at desc);

alter table public.waitlist_ip_events enable row level security;
alter table public.waitlist_ip_events force row level security;
-- No policies. Only the function below writes this table. Rows older than
-- two days are deleted for the IP being checked.
revoke all on table public.waitlist_ip_events from public, anon, authenticated;

create or replace function public.consume_waitlist_ip_quota(
  p_ip text,
  p_minute_limit integer default 6,
  p_daily_limit integer default 9
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
  v_minute integer := least(greatest(coalesce(p_minute_limit, 6), 1), 1000);
  v_daily integer := least(greatest(coalesce(p_daily_limit, 9), 1), 1000);
  v_now timestamptz := clock_timestamp();
  v_minute_count integer;
  v_minute_oldest timestamptz;
  v_day_count integer;
  v_day_oldest timestamptz;
begin
  if v_ip is null
     or length(v_ip) > 64
     or v_ip !~ '^[0-9a-fA-F:.]+$'
     or v_ip !~ '[0-9]'
  then
    return jsonb_build_object('allowed', false, 'reason', 'unavailable');
  end if;
  v_ip := lower(v_ip);

  perform pg_advisory_xact_lock(hashtextextended('waitlist_ip:' || v_ip, 0));

  delete from public.waitlist_ip_events
  where ip = v_ip and created_at < v_now - interval '2 days';

  select count(*), min(created_at)
    into v_minute_count, v_minute_oldest
  from public.waitlist_ip_events
  where ip = v_ip and created_at > v_now - interval '1 minute';

  if v_minute_count >= v_minute then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'minute',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_minute_oldest + interval '1 minute' - v_now))))
    );
  end if;

  select count(*), min(created_at)
    into v_day_count, v_day_oldest
  from public.waitlist_ip_events
  where ip = v_ip and created_at > v_now - interval '24 hours';

  if v_day_count >= v_daily then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'daily',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_day_oldest + interval '24 hours' - v_now))))
    );
  end if;

  insert into public.waitlist_ip_events (ip, created_at) values (v_ip, v_now);

  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.consume_waitlist_ip_quota(text, integer, integer) from public;
grant execute on function public.consume_waitlist_ip_quota(text, integer, integer) to anon, authenticated;
