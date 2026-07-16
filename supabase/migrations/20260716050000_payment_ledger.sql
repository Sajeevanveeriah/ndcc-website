-- Auditable payment ledger + derived order payment state (2026/27 season
-- readiness).
--
-- The previous model stored only orders.total_amount + a free-text
-- payment_status + a processed flag: no history, no part payments, no
-- idempotent webhook handling. This migration adds:
--
--   * order_payments — append-only ledger. Corrections are made with
--     reversing rows (status 'refunded' subtracts; 'void' excludes a row),
--     never by editing or deleting settled history.
--   * orders.amount_paid (maintained by trigger) and orders.balance_due
--     (generated column) with payment_status derived on every ledger write:
--     unpaid | part_paid | paid | refunded | partially_refunded | needs_review
--   * Guards: settled ledger rows are immutable and undeletable; an order's
--     total cannot change once a settled payment exists; cumulative settled
--     payments beyond the total mark the order needs_review instead of
--     silently exceeding it.
--   * merch_payment_settings — single-row CMS payment configuration
--     (card checkout switch, bank transfer switch, partial payments,
--     minimum partial amount, optional required deposit).
--
-- Rollback:
--   drop trigger orders_guard_total_after_settlement on orders;
--   drop function orders_guard_total_after_settlement();
--   drop trigger order_payments_apply_totals on order_payments;
--   drop trigger order_payments_protect_history on order_payments;
--   drop function apply_order_payment_totals();
--   drop function protect_order_payment_history();
--   drop table order_payments;
--   drop table merch_payment_settings;
--   alter table orders drop column balance_due, drop column amount_paid;
--   (orders.payment_status values written by the trigger remain but are
--   plain text and harmless.)

-- 1) Ledger ------------------------------------------------------------

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'AUD' check (currency = 'AUD'),
  method text not null check (method in ('bank_transfer', 'stripe', 'cash', 'other')),
  provider text,
  provider_reference text,
  provider_event_id text,
  status text not null default 'pending'
    check (status in ('pending', 'settled', 'failed', 'refunded', 'void')),
  received_at timestamptz,
  recorded_by text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  -- Set on a correcting row (status 'refunded' or 'void' context) to point
  -- at the ledger row it reverses.
  reverses_payment_id uuid references public.order_payments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Guarded FK (repo convention: orders(id) references are added as guarded
-- constraints so bootstrap replays never depend on file ordering).
-- ON DELETE RESTRICT: an order with payment history can never be
-- hard-deleted.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_payments_order_id_fkey'
  ) and to_regclass('public.orders') is not null then
    alter table public.order_payments
      add constraint order_payments_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete restrict;
  end if;
end $$;

create index if not exists order_payments_order_idx on public.order_payments (order_id);
create unique index if not exists order_payments_provider_event_unique
  on public.order_payments (provider_event_id)
  where provider_event_id is not null;

alter table public.order_payments enable row level security;
-- Server-only table: no anon/authenticated policies. The Next.js server
-- uses the service role key, which bypasses RLS.

-- 2) Derived order columns ----------------------------------------------

alter table public.orders
  add column if not exists amount_paid numeric(10,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'balance_due'
  ) then
    alter table public.orders
      add column balance_due numeric(10,2)
      generated always as (total_amount - amount_paid) stored;
  end if;
end $$;

-- 3) Ledger triggers -----------------------------------------------------

-- History protection: settled/refunded rows are immutable (except notes and
-- metadata) and can never be deleted.
create or replace function public.protect_order_payment_history()
returns trigger
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('settled', 'refunded') then
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
       or new.provider_event_id is distinct from old.provider_event_id then
      raise exception 'Settled or refunded payments are immutable; record a reversing payment instead.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists order_payments_protect_history on public.order_payments;
create trigger order_payments_protect_history
  before update or delete on public.order_payments
  for each row execute function public.protect_order_payment_history();

-- Totals derivation: recompute amount_paid / payment_status / order_status
-- on every ledger change. Locks the order row so concurrent webhook and
-- manual writes serialise.
create or replace function public.apply_order_payment_totals()
returns trigger
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order record;
  v_settled numeric(10,2);
  v_refunded numeric(10,2);
  v_paid numeric(10,2);
  v_status text;
  v_order_status text;
  v_review text;
begin
  v_order_id := coalesce(new.order_id, old.order_id);
  select id, total_amount, order_status, needs_review_reason
    into v_order
    from public.orders where id = v_order_id
    for update;
  if not found then
    return coalesce(new, old);
  end if;

  select
    coalesce(sum(amount) filter (where status = 'settled'), 0),
    coalesce(sum(amount) filter (where status = 'refunded'), 0)
  into v_settled, v_refunded
  from public.order_payments
  where order_id = v_order_id;

  v_paid := v_settled - v_refunded;

  if v_paid > v_order.total_amount then
    v_status := 'needs_review';
  elsif v_paid = v_order.total_amount and v_order.total_amount > 0 then
    v_status := 'paid';
  elsif v_paid > 0 and v_refunded > 0 then
    v_status := 'partially_refunded';
  elsif v_paid > 0 then
    v_status := 'part_paid';
  elsif v_refunded > 0 then
    v_status := 'refunded';
  else
    v_status := 'unpaid';
  end if;

  v_order_status := v_order.order_status;
  if v_status = 'paid' and v_order_status in ('submitted', 'queued_next_window') then
    v_order_status := 'ready_to_process';
  end if;

  v_review := v_order.needs_review_reason;
  if v_status = 'needs_review' then
    v_review := 'settled payments ($' || v_paid || ') exceed order total ($' || v_order.total_amount || ')';
  end if;

  update public.orders
  set amount_paid = v_paid,
      payment_status = v_status,
      order_status = v_order_status,
      needs_review_reason = coalesce(v_review, needs_review_reason)
  where id = v_order_id;

  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists order_payments_apply_totals on public.order_payments;
create trigger order_payments_apply_totals
  after insert or update or delete on public.order_payments
  for each row execute function public.apply_order_payment_totals();

-- 4) Order total guard ----------------------------------------------------

create or replace function public.orders_guard_total_after_settlement()
returns trigger
set search_path = public
as $$
begin
  if new.total_amount is distinct from old.total_amount then
    if exists (
      select 1 from public.order_payments
      where order_id = old.id and status in ('settled', 'refunded')
    ) then
      raise exception 'Order total cannot be changed after a settled payment exists; record an adjustment payment instead.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_guard_total_after_settlement on public.orders;
create trigger orders_guard_total_after_settlement
  before update of total_amount on public.orders
  for each row execute function public.orders_guard_total_after_settlement();

-- 5) CMS payment configuration --------------------------------------------

create table if not exists public.merch_payment_settings (
  id boolean primary key default true check (id),
  bank_transfer_enabled boolean not null default true,
  card_checkout_enabled boolean not null default false,
  partial_payments_enabled boolean not null default false,
  minimum_partial_amount numeric(10,2) not null default 10.00 check (minimum_partial_amount > 0),
  required_deposit_percent numeric(5,2) check (required_deposit_percent is null or (required_deposit_percent > 0 and required_deposit_percent <= 100)),
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.merch_payment_settings (id) values (true)
on conflict (id) do nothing;

alter table public.merch_payment_settings enable row level security;
-- Server-only: the public capability endpoint derives safe booleans via the
-- service role; no direct anon read.

notify pgrst, 'reload schema';
