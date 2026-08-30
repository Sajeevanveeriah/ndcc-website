-- Canonical, category-aware references for every website order and payment.
--
-- References are allocated by PostgreSQL so concurrent requests cannot issue
-- the same number. The Melbourne calendar year is part of the reference and
-- each category has its own atomic sequence:
--   NDCCMER-2026-000001  merchandise
--   NCDDKIT-2026-000001  kitchen
--   NDCCMEM-2026-000001  membership
--   NDCCEVT-2026-000001  event
--   NDCCRAF-2026-000001  raffle payment (not the raffle ticket number)
--   NDCCDCO-2026-000001  Dino Coach
--   NDCCPAY-2026-000001  future/general payment
--
-- Existing references remain unchanged. New payment-level columns are
-- nullable solely so historic rows can be retained without inventing data.

create table if not exists public.payment_reference_counters (
  category text not null check (
    category in ('merch', 'kitchen', 'membership', 'event', 'raffle', 'dino_coach', 'general')
  ),
  reference_year smallint not null check (reference_year between 2000 and 9999),
  last_value integer not null check (last_value between 1 and 999999),
  updated_at timestamptz not null default now(),
  primary key (category, reference_year)
);

alter table public.payment_reference_counters enable row level security;
revoke all on table public.payment_reference_counters from public, anon, authenticated;

create or replace function public.normalise_payment_reference_category(
  target_category text
) returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case lower(trim(coalesce(target_category, '')))
    when 'merch' then 'merch'
    when 'merchandise' then 'merch'
    when 'kitchen' then 'kitchen'
    when 'membership' then 'membership'
    when 'event' then 'event'
    when 'raffle' then 'raffle'
    when 'dino_coach' then 'dino_coach'
    when 'dino-coach' then 'dino_coach'
    when 'general' then 'general'
    when 'payment' then 'general'
    else 'general'
  end
$$;

revoke all on function public.normalise_payment_reference_category(text)
  from public, anon, authenticated;
grant execute on function public.normalise_payment_reference_category(text)
  to service_role;

create or replace function public.allocate_payment_reference(
  target_category text,
  target_at timestamptz default now()
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_category text;
  category_prefix text;
  melbourne_year smallint;
  sequence_value integer;
begin
  canonical_category := public.normalise_payment_reference_category(target_category);

  category_prefix := case canonical_category
    when 'merch' then 'NDCCMER'
    when 'kitchen' then 'NCDDKIT'
    when 'membership' then 'NDCCMEM'
    when 'event' then 'NDCCEVT'
    when 'raffle' then 'NDCCRAF'
    when 'dino_coach' then 'NDCCDCO'
    else 'NDCCPAY'
  end;
  melbourne_year := extract(
    year from coalesce(target_at, pg_catalog.now()) at time zone 'Australia/Melbourne'
  )::smallint;

  insert into public.payment_reference_counters(category, reference_year, last_value)
  values (canonical_category, melbourne_year, 1)
  on conflict (category, reference_year) do update
    set last_value = public.payment_reference_counters.last_value + 1,
        updated_at = pg_catalog.now()
  returning last_value into sequence_value;

  return category_prefix || '-' || melbourne_year::text || '-' || lpad(sequence_value::text, 6, '0');
end;
$$;

revoke all on function public.allocate_payment_reference(text, timestamptz) from public, anon, authenticated;
grant execute on function public.allocate_payment_reference(text, timestamptz) to service_role;

alter table public.order_payments
  add column if not exists payment_reference text,
  add column if not exists source_transaction_id uuid,
  add column if not exists client_operation_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'order_payments_source_transaction_id_fkey'
      and conrelid = 'public.order_payments'::regclass
  ) then
    alter table public.order_payments
      add constraint order_payments_source_transaction_id_fkey
      foreign key (source_transaction_id)
      references public.imported_transactions(id)
      on delete restrict;
  end if;
end $$;

alter table public.raffle_orders
  add column if not exists payment_reference text;

alter table public.fantasy_entries
  add column if not exists payment_reference text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'order_payments_payment_reference_format'
      and conrelid = 'public.order_payments'::regclass
  ) then
    alter table public.order_payments
      add constraint order_payments_payment_reference_format
      check (
        payment_reference is null
        or payment_reference ~ '^(NDCC(MER|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'raffle_orders_payment_reference_format'
      and conrelid = 'public.raffle_orders'::regclass
  ) then
    alter table public.raffle_orders
      add constraint raffle_orders_payment_reference_format
      check (
        payment_reference is null
        or payment_reference ~ '^NDCCRAF-[0-9]{4}-[0-9]{6}$'
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'fantasy_entries_payment_reference_format'
      and conrelid = 'public.fantasy_entries'::regclass
  ) then
    alter table public.fantasy_entries
      add constraint fantasy_entries_payment_reference_format
      check (
        payment_reference is null
        or payment_reference ~ '^NDCCDCO-[0-9]{4}-[0-9]{6}$'
      );
  end if;
end $$;

create unique index if not exists order_payments_payment_reference_unique
  on public.order_payments(payment_reference)
  where payment_reference is not null;
create unique index if not exists order_payments_source_transaction_unique
  on public.order_payments(source_transaction_id)
  where source_transaction_id is not null;
create unique index if not exists order_payments_client_operation_unique
  on public.order_payments(client_operation_id)
  where client_operation_id is not null;
create unique index if not exists order_payments_manual_reversal_unique
  on public.order_payments(reverses_payment_id)
  where status = 'refunded' and provider is null;
create unique index if not exists raffle_orders_payment_reference_unique
  on public.raffle_orders(payment_reference)
  where payment_reference is not null;
create unique index if not exists fantasy_entries_payment_reference_unique
  on public.fantasy_entries(payment_reference)
  where payment_reference is not null;

create unique index if not exists orders_stripe_session_id_unique
  on public.orders(stripe_session_id)
  where stripe_session_id is not null;
create unique index if not exists order_payments_stripe_payment_intent_unique
  on public.order_payments((metadata ->> 'payment_intent'))
  where provider = 'stripe'
    and status = 'settled'
    and metadata ->> 'payment_intent' is not null;
create unique index if not exists raffle_orders_stripe_payment_intent_unique
  on public.raffle_orders(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create unique index if not exists fantasy_entries_stripe_payment_intent_unique
  on public.fantasy_entries(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Reserve the unpaid balance while a Checkout Session is open. The order row
-- lock serialises different simultaneous part-payment requests, preventing
-- two valid Sessions from collectively charging more than the balance due.
create or replace function public.reserve_order_stripe_payment(
  target_order_id uuid,
  target_payment_reference text,
  target_amount_cents integer,
  target_payment_kind text,
  target_checkout_origin text,
  target_return_path text
) returns table(
  payment_id uuid,
  available_balance_cents integer,
  checkout_expires_at_unix bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  pending_cents integer;
  balance_cents integer;
  expected_prefix text;
  inserted_id uuid;
  clean_checkout_origin text := btrim(coalesce(target_checkout_origin, ''));
  clean_return_path text := btrim(coalesce(target_return_path, ''));
  reserved_at timestamptz := pg_catalog.date_trunc('second', pg_catalog.clock_timestamp());
  expires_at timestamptz;
  expires_at_unix bigint;
begin
  if target_order_id is null
    or target_amount_cents is null
    or target_amount_cents <= 0
    or target_payment_kind is null
    or target_payment_kind not in ('partial', 'balance') then
    raise exception 'Invalid Stripe payment reservation.' using errcode = 'check_violation';
  end if;

  if length(clean_checkout_origin) > 300
    or not (
      clean_checkout_origin ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'
      or clean_checkout_origin ~ '^http://(localhost|127[.]0[.]0[.]1)(:[0-9]{1,5})?$'
    ) then
    raise exception 'Invalid Stripe Checkout origin.' using errcode = 'check_violation';
  end if;
  if clean_return_path not in ('/merchandise', '/kitchen', '/join', '/events')
    and clean_return_path !~ '^/events/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception 'Invalid Stripe Checkout return path.' using errcode = 'check_violation';
  end if;

  expires_at := reserved_at + interval '1 hour';
  expires_at_unix := pg_catalog.floor(pg_catalog.extract(epoch from expires_at))::bigint;

  select * into target_order from public.orders
    where id = target_order_id for update;
  if not found then raise exception 'Order not found.' using errcode = 'no_data_found'; end if;

  update public.order_payments
    set status = 'failed',
        recorded_by = 'stripe-reservation-expiry'
    where order_id = target_order.id
      and status = 'pending'
      and provider = 'stripe'
      and provider_reference is null
      and case
        when coalesce(metadata ->> 'checkout_expires_at_unix', '') ~ '^[0-9]{10,12}$'
          then greatest(
            pg_catalog.to_timestamp((metadata ->> 'checkout_expires_at_unix')::double precision)
              + interval '5 minutes',
            created_at + interval '1 hour 5 minutes'
          ) < pg_catalog.now()
        else created_at < pg_catalog.now() - interval '2 hours'
      end;

  expected_prefix := case public.normalise_payment_reference_category(target_order.order_category)
    when 'merch' then 'NDCCMER'
    when 'kitchen' then 'NCDDKIT'
    when 'membership' then 'NDCCMEM'
    when 'event' then 'NDCCEVT'
    else 'NDCCPAY'
  end;
  if target_payment_reference is null
    or target_payment_reference !~ '^(NDCC(MER|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
    or left(target_payment_reference, length(expected_prefix) + 1) <> expected_prefix || '-' then
    raise exception 'Payment reference does not match the order category.' using errcode = 'check_violation';
  end if;

  select coalesce(round(sum(amount) * 100), 0)::integer
    into pending_cents
    from public.order_payments
    where order_id = target_order.id and status = 'pending';
  balance_cents := round((target_order.total_amount - target_order.amount_paid) * 100)::integer - pending_cents;
  if target_amount_cents > balance_cents then
    raise exception 'Payment amount exceeds the unreserved order balance.' using errcode = 'check_violation';
  end if;

  insert into public.order_payments(
    order_id, payment_reference, amount, currency, method, provider, status,
    recorded_by, metadata
  ) values (
    target_order.id, target_payment_reference, target_amount_cents::numeric / 100,
    'AUD', 'stripe', 'stripe', 'pending', 'stripe-checkout-reservation',
    pg_catalog.jsonb_build_object(
      'order_category', pg_catalog.lower(coalesce(target_order.order_category, 'general')),
      'payment_kind', target_payment_kind,
      'payment_reference', target_payment_reference,
      'item_number', target_payment_reference,
      'expected_amount_cents', target_amount_cents,
      'checkout_contract_version', '1',
      'checkout_origin', clean_checkout_origin,
      'checkout_return_path', clean_return_path,
      'checkout_created_at_unix', pg_catalog.floor(pg_catalog.extract(epoch from reserved_at))::bigint,
      'checkout_expires_at_unix', expires_at_unix,
      'checkout_expires_at', expires_at,
      'checkout_customer_email', coalesce(target_order.customer_email, ''),
      'checkout_order_reference', coalesce(target_order.payment_reference, target_order.id::text)
    )
  ) returning id into inserted_id;

  return query select inserted_id, balance_cents, expires_at_unix;
end;
$$;

revoke all on function public.reserve_order_stripe_payment(uuid, text, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_order_stripe_payment(uuid, text, integer, text, text, text)
  to service_role;

-- Manual receipts are recorded through one database transaction. The browser
-- supplies a UUID for the operator's action and reuses it for network retries;
-- a repeated UUID returns the original row only when the financial inputs are
-- identical. The order lock and pending-reservation sum prevent manual money
-- from exceeding the balance that is not already reserved by Checkout.
create or replace function public.record_manual_order_payment(
  target_order_id uuid,
  target_operation_id uuid,
  target_amount_cents integer,
  target_method text,
  target_recorded_by text,
  target_received_at timestamptz default null,
  target_notes text default '',
  target_provider_reference text default null
) returns table(payment_id uuid, payment_reference text, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  existing_payment public.order_payments%rowtype;
  clean_notes text := btrim(coalesce(target_notes, ''));
  clean_provider_reference text := nullif(btrim(coalesce(target_provider_reference, '')), '');
  clean_recorded_by text := btrim(coalesce(target_recorded_by, ''));
  effective_received_at timestamptz := coalesce(target_received_at, pg_catalog.now());
  pending_cents integer;
  available_cents integer;
  allocated_reference text;
  inserted_payment_id uuid;
begin
  if target_order_id is null or target_operation_id is null then
    raise exception 'Order and client operation ID are required.' using errcode = 'not_null_violation';
  end if;
  if target_amount_cents is null or target_amount_cents <= 0 then
    raise exception 'Manual payment must be a positive whole number of AUD cents.' using errcode = 'check_violation';
  end if;
  if target_method is null or target_method not in ('bank_transfer', 'cash', 'other') then
    raise exception 'Invalid manual payment method.' using errcode = 'check_violation';
  end if;
  if clean_recorded_by = '' or length(clean_recorded_by) > 254 then
    raise exception 'Manual payment recorder is invalid.' using errcode = 'check_violation';
  end if;
  if length(clean_notes) > 500 then
    raise exception 'Manual payment notes are too long.' using errcode = 'check_violation';
  end if;
  if clean_provider_reference is not null and length(clean_provider_reference) > 120 then
    raise exception 'Manual payment reference is too long.' using errcode = 'check_violation';
  end if;
  if effective_received_at < timestamptz '2000-01-01 00:00:00+00'
    or effective_received_at > pg_catalog.now() + interval '5 minutes' then
    raise exception 'Manual payment date is outside the allowed range.' using errcode = 'check_violation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_operation_id::text, 0)
  );
  select * into existing_payment
    from public.order_payments
    where client_operation_id = target_operation_id;
  if found then
    if existing_payment.status is distinct from 'settled'
      or existing_payment.provider is not null
      or existing_payment.payment_reference is null
      or existing_payment.received_at is null
      or existing_payment.order_id is distinct from target_order_id
      or round(existing_payment.amount * 100)::integer is distinct from target_amount_cents
      or existing_payment.method is distinct from target_method
      or coalesce(existing_payment.notes, '') is distinct from clean_notes
      or existing_payment.provider_reference is distinct from clean_provider_reference
      or (target_received_at is not null
        and existing_payment.received_at is distinct from effective_received_at)
      or coalesce(existing_payment.recorded_by, '') is distinct from clean_recorded_by then
      raise exception 'Client operation ID was already used for different payment details.'
        using errcode = 'integrity_constraint_violation';
    end if;
    return query select existing_payment.id, existing_payment.payment_reference, true;
    return;
  end if;

  select * into target_order
    from public.orders
    where id = target_order_id
    for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;
  if target_order.order_status = 'cancelled' then
    raise exception 'A payment cannot be recorded against a cancelled order.' using errcode = 'check_violation';
  end if;

  -- Re-check after taking the order lock so concurrent retries serialize.
  select * into existing_payment
    from public.order_payments
    where client_operation_id = target_operation_id;
  if found then
    if existing_payment.status is distinct from 'settled'
      or existing_payment.provider is not null
      or existing_payment.payment_reference is null
      or existing_payment.received_at is null
      or existing_payment.order_id is distinct from target_order_id
      or round(existing_payment.amount * 100)::integer is distinct from target_amount_cents
      or existing_payment.method is distinct from target_method
      or coalesce(existing_payment.notes, '') is distinct from clean_notes
      or existing_payment.provider_reference is distinct from clean_provider_reference
      or (target_received_at is not null
        and existing_payment.received_at is distinct from effective_received_at)
      or coalesce(existing_payment.recorded_by, '') is distinct from clean_recorded_by then
      raise exception 'Client operation ID was already used for different payment details.'
        using errcode = 'integrity_constraint_violation';
    end if;
    return query select existing_payment.id, existing_payment.payment_reference, true;
    return;
  end if;

  update public.order_payments
    set status = 'failed',
        recorded_by = 'stripe-reservation-expiry'
    where order_id = target_order.id
      and status = 'pending'
      and provider = 'stripe'
      and provider_reference is null
      and case
        when coalesce(metadata ->> 'checkout_expires_at_unix', '') ~ '^[0-9]{10,12}$'
          then greatest(
            pg_catalog.to_timestamp((metadata ->> 'checkout_expires_at_unix')::double precision)
              + interval '5 minutes',
            created_at + interval '1 hour 5 minutes'
          ) < pg_catalog.now()
        else created_at < pg_catalog.now() - interval '2 hours'
      end;

  select coalesce(round(sum(amount) * 100), 0)::integer
    into pending_cents
    from public.order_payments
    where order_id = target_order.id and status = 'pending';
  available_cents := round((target_order.total_amount - target_order.amount_paid) * 100)::integer - pending_cents;
  if target_amount_cents > available_cents then
    raise exception 'Manual payment exceeds the unreserved order balance.' using errcode = 'check_violation';
  end if;

  allocated_reference := public.allocate_payment_reference(
    coalesce(target_order.order_category, 'general'),
    effective_received_at
  );
  insert into public.order_payments(
    order_id, payment_reference, client_operation_id, amount, currency, method,
    provider, provider_reference, status, received_at, recorded_by, notes, metadata
  ) values (
    target_order.id, allocated_reference, target_operation_id,
    target_amount_cents::numeric / 100, 'AUD', target_method, null,
    clean_provider_reference, 'settled', effective_received_at, clean_recorded_by,
    clean_notes, pg_catalog.jsonb_build_object(
      'client_operation_id', target_operation_id,
      'payment_reference', allocated_reference,
      'item_number', allocated_reference,
      'order_reference', coalesce(target_order.payment_reference, target_order.id::text)
    )
  ) returning id into inserted_payment_id;

  return query select inserted_payment_id, allocated_reference, false;
end;
$$;

revoke all on function public.record_manual_order_payment(
  uuid, uuid, integer, text, text, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.record_manual_order_payment(
  uuid, uuid, integer, text, text, timestamptz, text, text
) to service_role;

-- Once a payment settles, its receipt/reference identity is part of immutable
-- financial history just like its amount, currency and provider event.
create or replace function public.protect_order_payment_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('settled', 'refunded')
      and coalesce(pg_catalog.current_setting('ndcc.allow_test_order_cleanup', true), '') <> 'on' then
      raise exception 'Settled or refunded payments cannot be deleted; record a reversing payment instead.';
    end if;
    return old;
  end if;

  if old.status in ('settled', 'refunded') then
    if new.amount is distinct from old.amount
       or new.order_id is distinct from old.order_id
       or new.method is distinct from old.method
       or new.currency is distinct from old.currency
       or new.status is distinct from old.status
       or new.provider is distinct from old.provider
       or new.provider_reference is distinct from old.provider_reference
       or new.provider_event_id is distinct from old.provider_event_id
       or new.received_at is distinct from old.received_at
       or new.recorded_by is distinct from old.recorded_by
       or new.reverses_payment_id is distinct from old.reverses_payment_id
       or new.source_transaction_id is distinct from old.source_transaction_id
       or new.client_operation_id is distinct from old.client_operation_id
       or new.payment_reference is distinct from old.payment_reference
       or new.metadata ->> 'payment_intent' is distinct from old.metadata ->> 'payment_intent'
       or new.metadata ->> 'item_number' is distinct from old.metadata ->> 'item_number'
       or new.metadata ->> 'payment_reference' is distinct from old.metadata ->> 'payment_reference'
       or new.metadata ->> 'order_reference' is distinct from old.metadata ->> 'order_reference'
       or new.metadata ->> 'client_operation_id' is distinct from old.metadata ->> 'client_operation_id'
       or new.metadata ->> 'imported_transaction_id' is distinct from old.metadata ->> 'imported_transaction_id'
       or new.metadata ->> 'bank_reference' is distinct from old.metadata ->> 'bank_reference' then
      raise exception 'Settled or refunded payments are immutable; record a reversing payment instead.';
    end if;
  end if;
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create or replace function public.ensure_fantasy_entry_payment_reference(
  target_entry_id uuid
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_reference text;
begin
  select payment_reference
    into existing_reference
    from public.fantasy_entries
    where id = target_entry_id
    for update;
  if not found then
    raise exception 'Dino Coach entry not found.' using errcode = 'no_data_found';
  end if;

  if existing_reference is null then
    existing_reference := public.allocate_payment_reference('dino_coach', pg_catalog.now());
    update public.fantasy_entries
      set payment_reference = existing_reference,
          updated_at = pg_catalog.now()
      where id = target_entry_id;
  end if;

  return existing_reference;
end;
$$;

revoke all on function public.ensure_fantasy_entry_payment_reference(uuid) from public, anon, authenticated;
grant execute on function public.ensure_fantasy_entry_payment_reference(uuid) to service_role;

-- Bank-import reconciliation is one transaction: the imported transaction,
-- confirmation and immutable ledger row can no longer disagree after a
-- partial application failure.
create or replace function public.confirm_imported_order_payment(
  target_transaction_id uuid,
  target_order_id uuid,
  target_confirmed_by uuid,
  target_notes text default 'Confirmed from payment reconciliation'
) returns table(payment_id uuid, payment_reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  imported public.imported_transactions%rowtype;
  target_order public.orders%rowtype;
  existing_payment public.order_payments%rowtype;
  allocated_reference text;
  inserted_payment_id uuid;
  imported_cents integer;
  pending_cents integer;
  available_cents integer;
  clean_bank_reference text;
  clean_notes text;
begin
  if target_transaction_id is null or target_order_id is null or target_confirmed_by is null then
    raise exception 'Transaction, order and confirmer are required.' using errcode = 'not_null_violation';
  end if;

  select * into imported
    from public.imported_transactions
    where id = target_transaction_id
    for update;
  if not found then
    raise exception 'Imported transaction not found.' using errcode = 'no_data_found';
  end if;

  select * into existing_payment
    from public.order_payments
    where source_transaction_id = target_transaction_id;
  if found then
    if existing_payment.order_id <> target_order_id
      or existing_payment.status is distinct from 'settled'
      or existing_payment.provider is distinct from 'bank_import'
      or existing_payment.payment_reference is null
      or existing_payment.amount is distinct from imported.amount then
      raise exception 'Imported transaction is already linked with conflicting payment details.'
        using errcode = 'integrity_constraint_violation';
    end if;
    return query select existing_payment.id, existing_payment.payment_reference;
    return;
  end if;

  if imported.matched_order_id is not null or imported.match_status = 'matched' then
    raise exception 'Imported transaction is already matched.' using errcode = 'integrity_constraint_violation';
  end if;
  imported_cents := round(imported.amount * 100)::integer;
  if imported.amount <= 0 or imported.amount * 100 <> imported_cents then
    raise exception 'Imported transaction amount must be positive whole AUD cents.' using errcode = 'check_violation';
  end if;
  clean_bank_reference := left(btrim(coalesce(imported.transaction_reference, '')), 200);
  clean_notes := left(btrim(coalesce(target_notes, 'Confirmed from payment reconciliation')), 500);

  select * into target_order
    from public.orders
    where id = target_order_id
    for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;
  if target_order.order_status = 'cancelled' then
    raise exception 'An imported payment cannot be recorded against a cancelled order.' using errcode = 'check_violation';
  end if;

  update public.order_payments
    set status = 'failed',
        recorded_by = 'stripe-reservation-expiry'
    where order_id = target_order.id
      and status = 'pending'
      and provider = 'stripe'
      and provider_reference is null
      and case
        when coalesce(metadata ->> 'checkout_expires_at_unix', '') ~ '^[0-9]{10,12}$'
          then greatest(
            pg_catalog.to_timestamp((metadata ->> 'checkout_expires_at_unix')::double precision)
              + interval '5 minutes',
            created_at + interval '1 hour 5 minutes'
          ) < pg_catalog.now()
        else created_at < pg_catalog.now() - interval '2 hours'
      end;

  select coalesce(round(sum(amount) * 100), 0)::integer
    into pending_cents
    from public.order_payments
    where order_id = target_order.id and status = 'pending';
  available_cents := round((target_order.total_amount - target_order.amount_paid) * 100)::integer - pending_cents;
  if imported_cents > available_cents then
    raise exception 'Imported transaction exceeds the unreserved order balance.' using errcode = 'check_violation';
  end if;

  allocated_reference := public.allocate_payment_reference(
    coalesce(target_order.order_category, 'general'),
    imported.transaction_date
  );

  insert into public.order_payments(
    order_id, payment_reference, source_transaction_id, amount, currency,
    method, provider, provider_reference, status, received_at, recorded_by,
    notes, metadata
  ) values (
    target_order.id, allocated_reference, imported.id, imported.amount, 'AUD',
    'bank_transfer', 'bank_import', 'imported_transaction:' || imported.id::text,
    'settled', imported.transaction_date, target_confirmed_by::text,
    clean_notes,
    pg_catalog.jsonb_build_object(
      'imported_transaction_id', imported.id,
      'bank_reference', clean_bank_reference,
      'payment_reference', allocated_reference,
      'item_number', allocated_reference,
      'order_reference', coalesce(target_order.payment_reference, target_order.id::text)
    )
  ) returning id into inserted_payment_id;

  insert into public.bank_transfer_confirmations(
    order_id, transaction_id, confirmed_by, bank_reference_used, notes
  ) values (
    target_order.id, imported.id, target_confirmed_by,
    clean_bank_reference,
    clean_notes
  );

  update public.imported_transactions
    set match_status = 'matched',
        matched_order_id = target_order.id,
        updated_at = pg_catalog.now()
    where id = imported.id;

  update public.orders
    set confirmed_by = target_confirmed_by,
        confirmed_at = pg_catalog.now(),
        bank_reference_used = clean_bank_reference,
        needs_review_reason = case
          when payment_status = 'needs_review' then needs_review_reason
          else ''
        end
    where id = target_order.id;

  return query select inserted_payment_id, allocated_reference;
end;
$$;

revoke all on function public.confirm_imported_order_payment(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_imported_order_payment(uuid, uuid, uuid, text)
  to service_role;

-- Direct Stripe Payment Links cannot carry a per-purchase server-allocated
-- NDCC reference. Retain their historic URL values for audit purposes but
-- disable that public payment mode so all website purchases are order-first.
update public.apparel_products
  set payment_mode = 'manual_enquiry',
      checkout_enabled = false
  where payment_mode = 'stripe_payment_link';

alter table public.apparel_products
  drop constraint if exists apparel_products_payment_mode_check;
alter table public.apparel_products
  add constraint apparel_products_payment_mode_check
  check (payment_mode in ('manual_enquiry', 'stripe_checkout'));

notify pgrst, 'reload schema';
