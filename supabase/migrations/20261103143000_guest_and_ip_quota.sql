-- Guest AI limits and anonymous-user guards.
-- Written only; NOT executed. Run this on the staging project BEFORE deploying
-- the guest-flow code. Nothing in this file was applied from the agent environment.
--
-- Anonymous sign-ins are `authenticated` in Postgres. auth.uid() is their user id,
-- and the JWT claim is_anonymous is true. This migration:
--   1. Replaces consume_generation_quota so anonymous callers use the guest daily
--      cap (never the signed-in daily argument) plus per-IP caps.
--   2. Stops anonymous users inserting into public.sheets. Permanent users
--      (is_anonymous false, or a token that predates the claim) are unchanged.
--   3. Lets a user delete their own sheet rows so the guest-migrate route can
--      remove rows after it copies them with the guest's own token.
--
-- Storage policies on uploads_private are intentionally NOT changed. Anonymous
-- users stay on the existing owner-folder rules: they can upload, read, and
-- delete only uploads_private/{auth.uid()}/.... They do not get a wider grant,
-- and they do not get the signed-in generation limits.
--
-- There is still no service-role key. The function is SECURITY DEFINER and only
-- counts rows for auth.uid() or for the IP the API passes. A direct RPC call
-- from a browser can pass its own limit numbers (the same trust model as the
-- previous function). It cannot flip is_anonymous: that comes from the JWT.
-- An anonymous call with a missing or nonsense IP is refused, not counted as
-- a signed-in generation.

create table if not exists public.generation_ip_events (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists generation_ip_events_ip_created_idx
  on public.generation_ip_events (ip, created_at desc);

alter table public.generation_ip_events enable row level security;
-- No policies. Only the function below writes this table. Rows older than
-- two days are deleted for the IP being checked. The value is the visitor IP
-- the API read from Vercel's proxy headers (see lib/client-ip.ts).
revoke all on table public.generation_ip_events from public, anon, authenticated;

-- The previous two-argument function must go. Leaving it in place makes
-- PostgREST unable to choose an overload when the API sends the new arguments.
drop function if exists public.consume_generation_quota(integer, integer);
drop function if exists public.consume_generation_quota(integer, integer, integer, text, integer, integer);

create or replace function public.consume_generation_quota(
  p_daily_limit integer default 20,
  p_minute_limit integer default 3,
  p_guest_daily_limit integer default 3,
  p_ip text default null,
  p_ip_daily_limit integer default 9,
  p_ip_minute_limit integer default 6
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  -- Missing claim counts as a permanent user so older sessions keep today's limits.
  -- Anonymous tokens from Supabase Auth always send is_anonymous true.
  v_is_anon boolean := coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  v_signed integer := least(greatest(coalesce(p_daily_limit, 20), 1), 1000);
  v_minute integer := least(greatest(coalesce(p_minute_limit, 3), 1), 1000);
  v_guest integer := least(greatest(coalesce(p_guest_daily_limit, 3), 1), 1000);
  v_ip_daily integer := least(greatest(coalesce(p_ip_daily_limit, 9), 1), 1000);
  v_ip_minute integer := least(greatest(coalesce(p_ip_minute_limit, 6), 1), 1000);
  v_daily integer;
  v_ip text := nullif(btrim(coalesce(p_ip, '')), '');
  v_now timestamptz := clock_timestamp();
  v_minute_count integer;
  v_minute_oldest timestamptz;
  v_day_count integer;
  v_day_oldest timestamptz;
  v_ip_minute_count integer;
  v_ip_minute_oldest timestamptz;
  v_ip_day_count integer;
  v_ip_day_oldest timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  if v_is_anon then
    -- Never the signed-in daily argument. Also never higher than that argument,
    -- so a bad guest setting cannot outrun a permanent account.
    v_daily := least(v_guest, v_signed);
    if v_ip is null
       or length(v_ip) > 64
       or v_ip !~ '^[0-9a-fA-F:.]+$'
       or v_ip !~ '[0-9]'
    then
      return jsonb_build_object('allowed', false, 'reason', 'unavailable');
    end if;
    v_ip := lower(v_ip);
  else
    v_daily := v_signed;
  end if;

  -- Same lock as before for this user. IP lock is taken second, and only for guests.
  perform pg_advisory_xact_lock(hashtextextended('generation_quota:' || v_uid::text, 0));
  if v_is_anon then
    perform pg_advisory_xact_lock(hashtextextended('generation_ip:' || v_ip, 0));
  end if;

  delete from public.generation_events
  where user_id = v_uid and created_at < v_now - interval '2 days';

  if v_is_anon then
    delete from public.generation_ip_events
    where ip = v_ip and created_at < v_now - interval '2 days';
  end if;

  select count(*), min(created_at)
    into v_minute_count, v_minute_oldest
  from public.generation_events
  where user_id = v_uid and created_at > v_now - interval '1 minute';

  if v_minute_count >= v_minute then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'minute',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_minute_oldest + interval '1 minute' - v_now))))
    );
  end if;

  select count(*), min(created_at)
    into v_day_count, v_day_oldest
  from public.generation_events
  where user_id = v_uid and created_at > v_now - interval '24 hours';

  if v_day_count >= v_daily then
    return jsonb_build_object(
      'allowed', false,
      'reason', case when v_is_anon then 'guest_daily' else 'daily' end,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_day_oldest + interval '24 hours' - v_now))))
    );
  end if;

  if v_is_anon then
    select count(*), min(created_at)
      into v_ip_minute_count, v_ip_minute_oldest
    from public.generation_ip_events
    where ip = v_ip and created_at > v_now - interval '1 minute';

    if v_ip_minute_count >= v_ip_minute then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'ip_minute',
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_ip_minute_oldest + interval '1 minute' - v_now))))
      );
    end if;

    select count(*), min(created_at)
      into v_ip_day_count, v_ip_day_oldest
    from public.generation_ip_events
    where ip = v_ip and created_at > v_now - interval '24 hours';

    if v_ip_day_count >= v_ip_daily then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'ip_daily',
        'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_ip_day_oldest + interval '24 hours' - v_now))))
      );
    end if;
  end if;

  insert into public.generation_events (user_id, created_at) values (v_uid, v_now);

  if v_is_anon then
    insert into public.generation_ip_events (ip, created_at) values (v_ip, v_now);
  end if;

  return jsonb_build_object(
    'allowed', true,
    'remaining_today', v_daily - v_day_count - 1
  );
end;
$$;

revoke all on function public.consume_generation_quota(integer, integer, integer, text, integer, integer) from public, anon;
grant execute on function public.consume_generation_quota(integer, integer, integer, text, integer, integer) to authenticated;

-- Anonymous users must not save into My sheets. Permissive owner policy stays;
-- this restrictive policy is AND-ed with it. Permanent users have
-- is_anonymous false, so their inserts are unchanged.
drop policy if exists "sheets: anonymous users cannot save" on public.sheets;
create policy "sheets: anonymous users cannot save"
  on public.sheets
  as restrictive
  for insert
  to authenticated
  with check (coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) is false);

-- The guest-migrate route deletes a guest's own rows after copying them,
-- using the guest's token. Permanent users can delete only their own rows too.
drop policy if exists "Users can delete their sheets" on public.sheets;
create policy "Users can delete their sheets"
  on public.sheets
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
