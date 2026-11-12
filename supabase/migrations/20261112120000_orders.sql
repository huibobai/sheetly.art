-- Orders for the flagged checkout flow.
-- Written only. NOT executed. Huibo runs it on staging first, then production,
-- and only after agreeing to turn checkout on.
--
-- Buyers can read their own orders. They can insert a pending order for
-- themselves (the checkout route uses their session). They cannot update or
-- delete, and they cannot insert a paid row: status is not in the insert
-- grant, and the insert policy requires status = 'pending'.
--
-- order_events is the raw webhook audit. idempotency_key is unique.
-- Authenticated and anon have no privileges on it.
--
-- A real provider webhook has no user session, so it cannot use the policies
-- above. Minimal option: set SUPABASE_SERVICE_ROLE_KEY on the server (not
-- NEXT_PUBLIC_) and use it only from POST /api/checkout/webhook. service_role
-- bypasses RLS. Do not add that key until checkout is approved.
--
-- record_mock_checkout_event is a test-mode bridge so PAYMENT_PROVIDER=mock
-- can mark the caller's own mock order without that key. It updates only
-- rows with provider = 'mock'. A mock payment must not unlock a download
-- once a real provider is selected (the app checks the active provider).
-- Do not run production with PAYMENT_PROVIDER=mock.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sheet_id uuid references public.sheets (id) on delete set null,
  sku text not null check (char_length(sku) between 1 and 64),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (
    status in ('pending', 'paid', 'failed', 'refunded', 'expired', 'cancelled')
  ),
  provider text not null check (char_length(provider) between 1 and 32),
  provider_session_id text,
  provider_payment_id text,
  customer_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_provider_session_key unique (provider, provider_session_id)
);

comment on table public.orders is
  'Checkout orders. Clients may insert a pending row and select their own. Status changes come from the webhook writer. Product kind (digital or physical) stays in app config.';

comment on column public.orders.status is
  'pending, paid, failed, refunded, expired, cancelled. Clients cannot set this; the default is pending.';

create index if not exists orders_entitlement_idx
  on public.orders (user_id, sheet_id, sku, provider, status);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id) on delete cascade,
  provider text not null,
  event_type text not null,
  idempotency_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint order_events_idempotency_key_key unique (idempotency_key)
);

comment on table public.order_events is
  'Raw webhook audit. idempotency_key is unique so a provider retry does not apply twice.';

alter table public.orders enable row level security;
alter table public.order_events enable row level security;

revoke all on table public.orders from public, anon;
revoke all on table public.order_events from public, anon, authenticated;

grant select on table public.orders to authenticated;

grant insert (
  id,
  user_id,
  sheet_id,
  sku,
  amount_cents,
  currency,
  provider,
  provider_session_id,
  customer_email
) on table public.orders to authenticated;

revoke update, delete on table public.orders from anon, authenticated;

drop policy if exists "Users can read their orders" on public.orders;
create policy "Users can read their orders"
  on public.orders
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can start a pending order" on public.orders;
create policy "Users can start a pending order"
  on public.orders
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and provider_payment_id is null
  );

-- service_role exists on Supabase and bypasses RLS. Skip the grant elsewhere.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update on table public.orders to service_role;
    grant select, insert on table public.order_events to service_role;
  end if;
end $$;

create or replace function public.touch_order_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.touch_order_updated_at() from public, anon, authenticated;

drop trigger if exists orders_touch_updated_at on public.orders;

create trigger orders_touch_updated_at
  before update on public.orders
  for each row
  execute function public.touch_order_updated_at();

-- Test-mode writer. security definer so it can update status, which the
-- caller cannot do directly. It still requires auth.uid() and provider mock.
create or replace function public.record_mock_checkout_event(
  p_order_id uuid,
  p_event_id text,
  p_event_type text,
  p_payment_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_inserted bigint;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_event_type not in ('paid', 'failed', 'refunded', 'expired') then
    raise exception 'invalid_event';
  end if;

  if p_event_id is null or char_length(p_event_id) = 0 or char_length(p_event_id) > 200 then
    raise exception 'invalid_event';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and user_id = auth.uid()
    and provider = 'mock'
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  insert into public.order_events (order_id, provider, event_type, idempotency_key, payload)
  values (v_order.id, 'mock', p_event_type, p_event_id, coalesce(p_payload, '{}'::jsonb))
  on conflict (idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object('duplicate', true, 'status', v_order.status, 'order_id', v_order.id);
  end if;

  v_status = case
    when p_event_type = 'paid' and v_order.status <> 'refunded' then 'paid'
    when p_event_type = 'refunded' and v_order.status in ('paid', 'refunded') then 'refunded'
    when p_event_type = 'failed' and v_order.status = 'pending' then 'failed'
    when p_event_type = 'expired' and v_order.status = 'pending' then 'expired'
    else v_order.status
  end;

  update public.orders
  set
    status = v_status,
    provider_payment_id = coalesce(p_payment_id, provider_payment_id)
  where id = v_order.id
  returning status into v_status;

  return jsonb_build_object('duplicate', false, 'status', v_status, 'order_id', v_order.id);
end;
$$;

revoke all on function public.record_mock_checkout_event(uuid, text, text, text, jsonb) from public, anon;

grant execute on function public.record_mock_checkout_event(uuid, text, text, text, jsonb) to authenticated;
