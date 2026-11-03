-- PR1: per-user quota for /api/generate (AI styles).
-- Written only; NOT executed. Huibo runs it on the test project first, then production.
--
-- The API route calls public.consume_generation_quota() with the signed-in user's JWT.
-- No service role key is needed: the function is SECURITY DEFINER and only ever counts
-- or records rows for auth.uid(). The table itself is not readable or writable by clients.

create table if not exists public.generation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists generation_events_user_created_idx
  on public.generation_events (user_id, created_at desc);

alter table public.generation_events enable row level security;
-- Deliberately no policies: only the SECURITY DEFINER function below touches this table.
revoke all on table public.generation_events from anon, authenticated;

create or replace function public.consume_generation_quota(
  p_daily_limit integer default 20,
  p_minute_limit integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_daily integer := least(greatest(coalesce(p_daily_limit, 20), 1), 1000);
  v_minute integer := least(greatest(coalesce(p_minute_limit, 3), 1), 1000);
  v_now timestamptz := clock_timestamp();
  v_minute_count integer;
  v_minute_oldest timestamptz;
  v_day_count integer;
  v_day_oldest timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  -- Serialise concurrent calls for the same user so two requests cannot both pass the last slot.
  perform pg_advisory_xact_lock(hashtextextended('generation_quota:' || v_uid::text, 0));

  -- Keep the table small: events older than two days no longer matter.
  delete from public.generation_events
  where user_id = v_uid and created_at < v_now - interval '2 days';

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
      'reason', 'daily',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_day_oldest + interval '24 hours' - v_now))))
    );
  end if;

  insert into public.generation_events (user_id, created_at) values (v_uid, v_now);

  return jsonb_build_object(
    'allowed', true,
    'remaining_today', v_daily - v_day_count - 1
  );
end;
$$;

revoke all on function public.consume_generation_quota(integer, integer) from public, anon;
grant execute on function public.consume_generation_quota(integer, integer) to authenticated;
