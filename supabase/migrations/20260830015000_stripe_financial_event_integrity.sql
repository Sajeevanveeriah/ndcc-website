-- Stripe financial integrity is movement based. Dispute lifecycle events are
-- snapshots only; money changes only when Stripe exposes a new signed Balance
-- Transaction on the current Dispute. Refund snapshots remain independent.

alter table public.order_payments
  drop constraint if exists order_payments_status_check;
alter table public.order_payments
  add constraint order_payments_status_check
  check (status in ('pending', 'settled', 'failed', 'refunded', 'disputed', 'recovered', 'void'));

alter table public.raffle_orders
  add column if not exists refunded_amount_cents integer not null default 0;
alter table public.raffle_orders
  drop constraint if exists raffle_orders_refunded_amount_check;
alter table public.raffle_orders
  add constraint raffle_orders_refunded_amount_check
  check (refunded_amount_cents >= 0 and refunded_amount_cents <= amount_cents);
alter table public.raffle_orders
  drop constraint if exists raffle_orders_status_check;
alter table public.raffle_orders
  add constraint raffle_orders_status_check
  check (status in ('pending_payment', 'paid', 'cancelled', 'partially_refunded', 'refunded', 'disputed'));

alter table public.fantasy_entries
  add column if not exists refunded_amount_cents integer not null default 0;
alter table public.fantasy_entries
  drop constraint if exists fantasy_entries_refunded_amount_check;
alter table public.fantasy_entries
  add constraint fantasy_entries_refunded_amount_check
  check (refunded_amount_cents >= 0 and refunded_amount_cents <= entry_fee_cents);

alter table public.raffle_tickets
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;
alter table public.raffle_tickets
  drop constraint if exists raffle_tickets_ticket_reference_check;
alter table public.raffle_tickets
  add constraint raffle_tickets_ticket_reference_check
  check (ticket_reference ~ '^NDCCRAF-[0-9]{6}$');

alter table public.raffle_payment_events
  add column if not exists provider_created_at timestamptz,
  add column if not exists evidence jsonb not null default '{}'::jsonb;

-- Signed-event inbox. Recognised events may wait here until Checkout
-- settlement persists the PaymentIntent link, then are replayed immediately.
create table if not exists public.stripe_payment_events (
  provider_event_id text primary key check (provider_event_id ~ '^evt_'),
  event_type text not null,
  payment_intent_id text not null check (payment_intent_id ~ '^pi_'),
  payment_domain text not null,
  order_payment_id uuid,
  raffle_order_id uuid,
  fantasy_entry_id uuid,
  dispute_id text,
  provider_created_at timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.stripe_payment_events
  add column if not exists payment_intent_id text,
  add column if not exists raffle_order_id uuid,
  add column if not exists fantasy_entry_id uuid,
  add column if not exists dispute_id text,
  add column if not exists applied_at timestamptz;
alter table public.stripe_payment_events
  drop constraint if exists stripe_payment_events_payment_domain_check,
  drop constraint if exists stripe_payment_events_domain_check,
  drop constraint if exists stripe_payment_events_domain_link_check,
  drop constraint if exists stripe_payment_events_order_payment_id_fkey,
  drop constraint if exists stripe_payment_events_raffle_order_id_fkey,
  drop constraint if exists stripe_payment_events_fantasy_entry_id_fkey;
alter table public.stripe_payment_events
  add constraint stripe_payment_events_domain_check
    check (payment_domain in ('pending', 'order', 'raffle', 'dino_coach')),
  add constraint stripe_payment_events_domain_link_check check (
    (payment_domain = 'pending' and num_nonnulls(order_payment_id, raffle_order_id, fantasy_entry_id) = 0)
    or (payment_domain <> 'pending' and num_nonnulls(order_payment_id, raffle_order_id, fantasy_entry_id) = 1)
  ),
  add constraint stripe_payment_events_order_payment_id_fkey
    foreign key (order_payment_id) references public.order_payments(id) on delete cascade,
  add constraint stripe_payment_events_raffle_order_id_fkey
    foreign key (raffle_order_id) references public.raffle_orders(id) on delete cascade,
  add constraint stripe_payment_events_fantasy_entry_id_fkey
    foreign key (fantasy_entry_id) references public.fantasy_entries(id) on delete cascade;
create index if not exists stripe_payment_events_pending_pi_idx
  on public.stripe_payment_events(payment_intent_id, provider_created_at, provider_event_id)
  where payment_domain = 'pending';

-- Current Stripe API snapshot for every du_ object. Status is not money.
create table if not exists public.stripe_disputes (
  dispute_id text primary key check (dispute_id ~ '^du_'),
  payment_intent_id text not null check (payment_intent_id ~ '^pi_'),
  charge_id text not null check (charge_id ~ '^ch_'),
  payment_domain text not null check (payment_domain in ('order', 'raffle', 'dino_coach')),
  order_payment_id uuid references public.order_payments(id) on delete cascade,
  raffle_order_id uuid references public.raffle_orders(id) on delete cascade,
  fantasy_entry_id uuid references public.fantasy_entries(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency = 'aud'),
  status text not null check (status in (
    'warning_needs_response', 'warning_under_review', 'warning_closed',
    'needs_response', 'under_review', 'won', 'lost', 'prevented'
  )),
  reason text,
  provider_created_at timestamptz not null,
  snapshot_observed_at timestamptz not null,
  latest_provider_event_id text not null check (latest_provider_event_id ~ '^evt_'),
  snapshot jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_disputes_domain_link_check
    check (num_nonnulls(order_payment_id, raffle_order_id, fantasy_entry_id) = 1)
);
create index if not exists stripe_disputes_pi_idx
  on public.stripe_disputes(payment_intent_id, status);

-- Balance Transaction IDs are the financial idempotency boundary. Gross
-- signed amount changes customer paid state; fee/net are audit evidence only.
create table if not exists public.stripe_dispute_balance_movements (
  balance_transaction_id text primary key check (balance_transaction_id ~ '^txn_'),
  dispute_id text not null references public.stripe_disputes(dispute_id) on delete cascade,
  payment_intent_id text not null check (payment_intent_id ~ '^pi_'),
  payment_domain text not null check (payment_domain in ('order', 'raffle', 'dino_coach')),
  order_payment_id uuid references public.order_payments(id) on delete cascade,
  raffle_order_id uuid references public.raffle_orders(id) on delete cascade,
  fantasy_entry_id uuid references public.fantasy_entries(id) on delete cascade,
  amount_cents integer not null,
  fee_cents integer not null default 0,
  net_cents integer not null,
  currency text not null check (currency = 'aud'),
  movement_type text,
  reporting_category text,
  provider_created_at timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint stripe_dispute_movements_domain_link_check
    check (num_nonnulls(order_payment_id, raffle_order_id, fantasy_entry_id) = 1)
);
create index if not exists stripe_dispute_movements_pi_idx
  on public.stripe_dispute_balance_movements(payment_intent_id, provider_created_at);

-- Refund events are cumulative Charge snapshots. Greatest-per-Charge makes
-- out-of-order delivery monotonic and keeps refunds independent of disputes.
create table if not exists public.stripe_charge_refund_snapshots (
  charge_id text primary key check (charge_id ~ '^ch_'),
  payment_intent_id text not null check (payment_intent_id ~ '^pi_'),
  payment_domain text not null check (payment_domain in ('order', 'raffle', 'dino_coach')),
  order_payment_id uuid references public.order_payments(id) on delete cascade,
  raffle_order_id uuid references public.raffle_orders(id) on delete cascade,
  fantasy_entry_id uuid references public.fantasy_entries(id) on delete cascade,
  charge_amount_cents integer not null check (charge_amount_cents > 0),
  amount_refunded_cents integer not null check (
    amount_refunded_cents >= 0 and amount_refunded_cents <= charge_amount_cents
  ),
  currency text not null check (currency = 'aud'),
  latest_provider_event_id text not null check (latest_provider_event_id ~ '^evt_'),
  provider_created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint stripe_refund_snapshots_domain_link_check
    check (num_nonnulls(order_payment_id, raffle_order_id, fantasy_entry_id) = 1)
);
create index if not exists stripe_refund_snapshots_pi_idx
  on public.stripe_charge_refund_snapshots(payment_intent_id);

alter table public.stripe_payment_events enable row level security;
alter table public.stripe_disputes enable row level security;
alter table public.stripe_dispute_balance_movements enable row level security;
alter table public.stripe_charge_refund_snapshots enable row level security;
revoke all on table public.stripe_payment_events from public, anon, authenticated;
revoke all on table public.stripe_disputes from public, anon, authenticated;
revoke all on table public.stripe_dispute_balance_movements from public, anon, authenticated;
revoke all on table public.stripe_charge_refund_snapshots from public, anon, authenticated;
grant select on table public.stripe_payment_events to service_role;

-- Append-only settlement/refund/withdrawal/reinstatement rows derive totals.
-- A refund plus withdrawal may make raw net negative: floor amount_paid at
-- zero, retain the evidence, and flag review instead of rejecting the webhook.
create or replace function public.apply_order_payment_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_order_id uuid;
  target_order record;
  settled numeric(10,2);
  refunded numeric(10,2);
  disputed numeric(10,2);
  recovered numeric(10,2);
  raw_paid numeric(10,2);
  paid numeric(10,2);
  derived_status text;
  derived_order_status text;
  review_reason text;
begin
  target_order_id := coalesce(new.order_id, old.order_id);
  select id, total_amount, order_status, needs_review_reason
    into target_order
    from public.orders
    where id = target_order_id
    for update;
  if not found then return coalesce(new, old); end if;

  select
    coalesce(sum(amount) filter (where status = 'settled'), 0),
    coalesce(sum(amount) filter (where status = 'refunded'), 0),
    coalesce(sum(amount) filter (where status = 'disputed'), 0),
    coalesce(sum(amount) filter (where status = 'recovered'), 0)
  into settled, refunded, disputed, recovered
  from public.order_payments
  where order_id = target_order_id;

  raw_paid := settled - refunded - disputed + recovered;
  paid := greatest(raw_paid, 0);
  if raw_paid < 0 or disputed > recovered or paid > target_order.total_amount then
    derived_status := 'needs_review';
  elsif paid = target_order.total_amount and target_order.total_amount > 0 then
    derived_status := 'paid';
  elsif paid > 0 and refunded > 0 then
    derived_status := 'partially_refunded';
  elsif paid > 0 then
    derived_status := 'part_paid';
  elsif refunded > 0 then
    derived_status := 'refunded';
  else
    derived_status := 'unpaid';
  end if;

  derived_order_status := target_order.order_status;
  if derived_status = 'paid' and derived_order_status in ('submitted', 'queued_next_window') then
    derived_order_status := 'ready_to_process';
  elsif derived_status <> 'paid' and derived_order_status = 'ready_to_process' then
    derived_order_status := 'submitted';
  end if;

  review_reason := target_order.needs_review_reason;
  if raw_paid < 0 then
    review_reason := 'Stripe refunds/dispute movements exceed settled funds by $' || abs(raw_paid);
  elsif disputed > recovered then
    review_reason := 'Stripe dispute balance movements currently withhold $' || (disputed - recovered);
  elsif paid > target_order.total_amount then
    review_reason := 'settled payments ($' || paid || ') exceed order total ($' || target_order.total_amount || ')';
  elsif review_reason like 'Stripe refunds/dispute movements exceed %'
     or review_reason like 'Stripe dispute balance movements currently withhold %' then
    review_reason := '';
  end if;

  update public.orders
    set amount_paid = paid,
        payment_status = derived_status,
        order_status = derived_order_status,
        needs_review_reason = coalesce(review_reason, '')
    where id = target_order_id;
  return coalesce(new, old);
end;
$$;

create or replace function public.protect_order_payment_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('settled', 'refunded', 'disputed', 'recovered')
      and coalesce(pg_catalog.current_setting('ndcc.allow_test_order_cleanup', true), '') <> 'on' then
      raise exception 'Financial-history payments cannot be deleted; record a reversing payment instead.';
    end if;
    return old;
  end if;

  if old.status in ('settled', 'refunded', 'disputed', 'recovered') then
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
      raise exception 'Financial-history payments are immutable; record a reversing payment instead.';
    end if;
  end if;
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop function if exists public.apply_order_stripe_financial_event(text, text, text, timestamptz, text, integer, integer, text);
drop function if exists public.apply_raffle_stripe_financial_event(text, text, text, timestamptz, text, integer, integer, text);

-- Sole financial-event mutation boundary: claim Event, upsert current du_
-- snapshot, insert unseen txn_ movements, record refund snapshot, derive state.
create or replace function public.apply_stripe_financial_event(
  target_payment_intent_id text,
  target_provider_event_id text,
  target_event_type text,
  target_event_created_at timestamptz,
  target_charge_id text,
  target_currency text,
  target_charge_amount_cents integer,
  target_amount_refunded_cents integer,
  target_dispute_id text,
  target_dispute_status text,
  target_dispute_reason text,
  target_dispute_amount_cents integer,
  target_dispute_created_at timestamptz,
  target_snapshot_observed_at timestamptz,
  target_balance_movements jsonb,
  target_recognised_ndcc boolean,
  target_evidence jsonb
) returns table(
  handled boolean,
  duplicate boolean,
  deferred boolean,
  payment_domain text,
  order_id uuid,
  raffle_order_id uuid,
  fantasy_entry_id uuid,
  resulting_status text,
  state_changed boolean,
  inserted_movements integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  original public.order_payments%rowtype;
  ordinary_order public.orders%rowtype;
  raffle public.raffle_orders%rowtype;
  dino public.fantasy_entries%rowtype;
  existing_event public.stripe_payment_events%rowtype;
  existing_dispute public.stripe_disputes%rowtype;
  existing_movement public.stripe_dispute_balance_movements%rowtype;
  existing_refund public.stripe_charge_refund_snapshots%rowtype;
  domain_name text;
  domain_count integer;
  event_inserted boolean := false;
  event_was_duplicate boolean := false;
  movement_inserted boolean := false;
  movement jsonb;
  movement_id text;
  movement_amount integer;
  movement_fee integer;
  movement_net integer;
  movement_currency text;
  movement_created_at timestamptz;
  movement_count integer := 0;
  canonical_reference text;
  original_cents integer;
  total_refunded_cents integer := 0;
  already_recorded_refund_cents integer := 0;
  refund_delta_cents integer := 0;
  active_disputes integer := 0;
  before_status text;
  after_status text;
  changed boolean := false;
  replay_arguments jsonb;
begin
  if coalesce(target_payment_intent_id, '') = ''
    or coalesce(target_provider_event_id, '') = ''
    or target_payment_intent_id !~ '^pi_'
    or target_provider_event_id !~ '^evt_'
    or target_event_type not in (
      'charge.refunded',
      'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
      'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated'
    )
    or lower(coalesce(target_currency, '')) <> 'aud'
    or jsonb_typeof(coalesce(target_balance_movements, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid Stripe financial event.' using errcode = 'check_violation';
  end if;

  if target_event_type in (
    'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated'
  ) and pg_catalog.jsonb_array_length(target_balance_movements) = 0 then
    raise exception 'Stripe dispute movement event has no Balance Transaction.'
      using errcode = 'check_violation';
  elsif target_event_type not in (
    'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated'
  ) and pg_catalog.jsonb_array_length(target_balance_movements) <> 0 then
    raise exception 'Stripe dispute lifecycle snapshots cannot move money.'
      using errcode = 'check_violation';
  end if;

  if target_event_type = 'charge.refunded' then
    if coalesce(target_charge_id, '') !~ '^ch_'
      or coalesce(target_charge_amount_cents, 0) <= 0
      or coalesce(target_amount_refunded_cents, -1) < 0
      or target_amount_refunded_cents > target_charge_amount_cents then
      raise exception 'Invalid Stripe refund snapshot.' using errcode = 'check_violation';
    end if;
  elsif coalesce(target_charge_id, '') !~ '^ch_'
    or coalesce(target_dispute_id, '') !~ '^du_'
    or target_dispute_status not in (
      'warning_needs_response', 'warning_under_review', 'warning_closed',
      'needs_response', 'under_review', 'won', 'lost', 'prevented'
    )
    or coalesce(target_dispute_amount_cents, 0) <= 0
    or target_snapshot_observed_at is null then
    raise exception 'Invalid Stripe dispute snapshot.' using errcode = 'check_violation';
  end if;

  -- Serialise the no-link -> pending handoff against every transaction that
  -- can persist this PaymentIntent link. The lock is acquired before row
  -- locks, so a financial event cannot commit just after settlement replay.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_payment_intent_id, 614749110)
  );

  select * into original
    from public.order_payments
    where provider = 'stripe'
      and status = 'settled'
      and metadata ->> 'payment_intent' = target_payment_intent_id
    for update;
  select * into raffle
    from public.raffle_orders
    where stripe_payment_intent_id = target_payment_intent_id
    for update;
  select * into dino
    from public.fantasy_entries
    where stripe_payment_intent_id = target_payment_intent_id
    for update;

  domain_count := (case when original.id is null then 0 else 1 end)
    + (case when raffle.id is null then 0 else 1 end)
    + (case when dino.id is null then 0 else 1 end);
  if domain_count > 1 then
    raise exception 'Stripe PaymentIntent is linked to multiple NDCC payment domains.'
      using errcode = 'integrity_constraint_violation';
  end if;

  replay_arguments := pg_catalog.jsonb_build_object(
    'target_payment_intent_id', target_payment_intent_id,
    'target_provider_event_id', target_provider_event_id,
    'target_event_type', target_event_type,
    'target_event_created_at', target_event_created_at,
    'target_charge_id', target_charge_id,
    'target_currency', lower(target_currency),
    'target_charge_amount_cents', target_charge_amount_cents,
    'target_amount_refunded_cents', target_amount_refunded_cents,
    'target_dispute_id', target_dispute_id,
    'target_dispute_status', target_dispute_status,
    'target_dispute_reason', target_dispute_reason,
    'target_dispute_amount_cents', target_dispute_amount_cents,
    'target_dispute_created_at', target_dispute_created_at,
    'target_snapshot_observed_at', target_snapshot_observed_at,
    'target_balance_movements', coalesce(target_balance_movements, '[]'::jsonb),
    'target_recognised_ndcc', true,
    'target_evidence', coalesce(target_evidence, '{}'::jsonb)
  );

  if domain_count = 0 then
    if not coalesce(target_recognised_ndcc, false) then
      return query select false, false, false, null::text, null::uuid,
        null::uuid, null::uuid, null::text, false, 0;
      return;
    end if;
    insert into public.stripe_payment_events(
      provider_event_id, event_type, payment_intent_id, payment_domain,
      dispute_id, provider_created_at, evidence
    ) values (
      target_provider_event_id, target_event_type, target_payment_intent_id, 'pending',
      target_dispute_id, coalesce(target_event_created_at, pg_catalog.now()),
      coalesce(target_evidence, '{}'::jsonb)
        || pg_catalog.jsonb_build_object('rpc_args', replay_arguments)
    ) on conflict (provider_event_id) do nothing
    returning true into event_inserted;
    event_inserted := coalesce(event_inserted, false);
    if not event_inserted then
      select * into existing_event from public.stripe_payment_events
        where provider_event_id = target_provider_event_id for update;
      if existing_event.event_type <> target_event_type
        or existing_event.payment_intent_id <> target_payment_intent_id
        or existing_event.dispute_id is distinct from target_dispute_id then
        raise exception 'Conflicting duplicate Stripe financial event.'
          using errcode = 'integrity_constraint_violation';
      end if;
      update public.stripe_payment_events set
        evidence = coalesce(target_evidence, '{}'::jsonb)
          || pg_catalog.jsonb_build_object('rpc_args', replay_arguments)
      where provider_event_id = target_provider_event_id
        and payment_domain = 'pending'
        and (
          target_snapshot_observed_at is null
          or coalesce(
            nullif(evidence #>> '{rpc_args,target_snapshot_observed_at}', '')::timestamptz,
            '-infinity'::timestamptz
          ) <= target_snapshot_observed_at
        );
    end if;
    return query select false, not event_inserted, true, 'pending'::text,
      null::uuid, null::uuid, null::uuid, null::text, false, 0;
    return;
  end if;

  if original.id is not null then
    domain_name := 'order';
    select * into ordinary_order from public.orders where id = original.order_id for update;
    original_cents := round(original.amount * 100)::integer;
    before_status := ordinary_order.payment_status;
  elsif raffle.id is not null then
    domain_name := 'raffle';
    original_cents := raffle.amount_cents;
    before_status := raffle.status;
  else
    domain_name := 'dino_coach';
    original_cents := dino.entry_fee_cents;
    before_status := dino.status;
  end if;
  if target_event_type = 'charge.refunded' and target_charge_amount_cents <> original_cents then
    raise exception 'Stripe Charge amount does not match the NDCC settled payment.' using errcode = 'check_violation';
  end if;
  if target_event_type <> 'charge.refunded' and target_dispute_amount_cents > original_cents then
    raise exception 'Stripe dispute amount exceeds the NDCC settled payment.' using errcode = 'check_violation';
  end if;

  select * into existing_event from public.stripe_payment_events
    where provider_event_id = target_provider_event_id for update;
  if found then
    event_was_duplicate := true;
    if existing_event.event_type <> target_event_type
      or existing_event.payment_intent_id <> target_payment_intent_id
      or existing_event.payment_domain not in ('pending', domain_name) then
      raise exception 'Conflicting duplicate Stripe financial event.'
        using errcode = 'integrity_constraint_violation';
    end if;
    update public.stripe_payment_events set
      payment_domain = domain_name,
      order_payment_id = case when domain_name = 'order' then original.id else null end,
      raffle_order_id = case when domain_name = 'raffle' then raffle.id else null end,
      fantasy_entry_id = case when domain_name = 'dino_coach' then dino.id else null end,
      dispute_id = target_dispute_id,
      evidence = coalesce(target_evidence, '{}'::jsonb)
        || pg_catalog.jsonb_build_object('rpc_args', replay_arguments)
    where provider_event_id = target_provider_event_id;
  else
    insert into public.stripe_payment_events(
      provider_event_id, event_type, payment_intent_id, payment_domain,
      order_payment_id, raffle_order_id, fantasy_entry_id, dispute_id,
      provider_created_at, evidence
    ) values (
      target_provider_event_id, target_event_type, target_payment_intent_id, domain_name,
      case when domain_name = 'order' then original.id else null end,
      case when domain_name = 'raffle' then raffle.id else null end,
      case when domain_name = 'dino_coach' then dino.id else null end,
      target_dispute_id, coalesce(target_event_created_at, pg_catalog.now()),
      coalesce(target_evidence, '{}'::jsonb)
        || pg_catalog.jsonb_build_object('rpc_args', replay_arguments)
    );
  end if;

  if target_event_type = 'charge.refunded' then
    select * into existing_refund from public.stripe_charge_refund_snapshots
      where charge_id = target_charge_id for update;
    if found and (
      existing_refund.payment_intent_id <> target_payment_intent_id
      or existing_refund.payment_domain <> domain_name
      or existing_refund.charge_amount_cents <> target_charge_amount_cents
      or existing_refund.currency <> lower(target_currency)
    ) then
      raise exception 'Conflicting Stripe Charge refund identity.'
        using errcode = 'integrity_constraint_violation';
    end if;
    insert into public.stripe_charge_refund_snapshots(
      charge_id, payment_intent_id, payment_domain,
      order_payment_id, raffle_order_id, fantasy_entry_id,
      charge_amount_cents, amount_refunded_cents, currency,
      latest_provider_event_id, provider_created_at
    ) values (
      target_charge_id, target_payment_intent_id, domain_name,
      case when domain_name = 'order' then original.id else null end,
      case when domain_name = 'raffle' then raffle.id else null end,
      case when domain_name = 'dino_coach' then dino.id else null end,
      target_charge_amount_cents, target_amount_refunded_cents, lower(target_currency),
      target_provider_event_id, coalesce(target_event_created_at, pg_catalog.now())
    ) on conflict (charge_id) do update set
      amount_refunded_cents = greatest(
        public.stripe_charge_refund_snapshots.amount_refunded_cents,
        excluded.amount_refunded_cents
      ),
      latest_provider_event_id = case
        when excluded.amount_refunded_cents >= public.stripe_charge_refund_snapshots.amount_refunded_cents
          then excluded.latest_provider_event_id
        else public.stripe_charge_refund_snapshots.latest_provider_event_id
      end,
      provider_created_at = greatest(
        public.stripe_charge_refund_snapshots.provider_created_at,
        excluded.provider_created_at
      ),
      updated_at = pg_catalog.now();
  else
    select * into existing_dispute from public.stripe_disputes
      where dispute_id = target_dispute_id for update;
    if found and (
      existing_dispute.payment_intent_id <> target_payment_intent_id
      or existing_dispute.charge_id is distinct from target_charge_id
      or existing_dispute.payment_domain <> domain_name
      or existing_dispute.amount_cents <> target_dispute_amount_cents
      or existing_dispute.currency <> lower(target_currency)
    ) then
      raise exception 'Conflicting Stripe Dispute identity.'
        using errcode = 'integrity_constraint_violation';
    end if;
    insert into public.stripe_disputes(
      dispute_id, payment_intent_id, charge_id, payment_domain,
      order_payment_id, raffle_order_id, fantasy_entry_id,
      amount_cents, currency, status, reason, provider_created_at,
      snapshot_observed_at, latest_provider_event_id, snapshot
    ) values (
      target_dispute_id, target_payment_intent_id, target_charge_id, domain_name,
      case when domain_name = 'order' then original.id else null end,
      case when domain_name = 'raffle' then raffle.id else null end,
      case when domain_name = 'dino_coach' then dino.id else null end,
      target_dispute_amount_cents, lower(target_currency), target_dispute_status,
      target_dispute_reason, coalesce(target_dispute_created_at, target_event_created_at, pg_catalog.now()),
      target_snapshot_observed_at, target_provider_event_id,
      coalesce(target_evidence, '{}'::jsonb)
    ) on conflict (dispute_id) do update set
      charge_id = excluded.charge_id,
      status = excluded.status,
      reason = excluded.reason,
      provider_created_at = excluded.provider_created_at,
      snapshot_observed_at = excluded.snapshot_observed_at,
      latest_provider_event_id = excluded.latest_provider_event_id,
      snapshot = excluded.snapshot,
      updated_at = pg_catalog.now()
    where (
      public.stripe_disputes.status not in ('won', 'lost', 'prevented')
      or excluded.status in ('won', 'lost', 'prevented')
    ) and (
      excluded.snapshot_observed_at > public.stripe_disputes.snapshot_observed_at
      or (
        excluded.snapshot_observed_at = public.stripe_disputes.snapshot_observed_at
        and case
          when excluded.status in ('won', 'lost', 'prevented') then 3
          when excluded.status in ('needs_response', 'under_review') then 2
          else 1
        end >= case
          when public.stripe_disputes.status in ('won', 'lost', 'prevented') then 3
          when public.stripe_disputes.status in ('needs_response', 'under_review') then 2
          else 1
        end
      )
    );

    for movement in select value from pg_catalog.jsonb_array_elements(target_balance_movements)
    loop
      movement_id := movement ->> 'id';
      movement_currency := lower(coalesce(movement ->> 'currency', ''));
      if coalesce(movement_id, '') !~ '^txn_'
        or coalesce(movement ->> 'amount_cents', '') !~ '^-?[0-9]+$'
        or coalesce(movement ->> 'fee_cents', '') !~ '^-?[0-9]+$'
        or coalesce(movement ->> 'net_cents', '') !~ '^-?[0-9]+$'
        or movement_currency <> 'aud'
        or coalesce(movement ->> 'created_at', '') = '' then
        raise exception 'Invalid Stripe Dispute balance movement.' using errcode = 'check_violation';
      end if;
      movement_amount := (movement ->> 'amount_cents')::integer;
      movement_fee := (movement ->> 'fee_cents')::integer;
      movement_net := (movement ->> 'net_cents')::integer;
      movement_created_at := (movement ->> 'created_at')::timestamptz;
      movement_inserted := false;

      insert into public.stripe_dispute_balance_movements(
        balance_transaction_id, dispute_id, payment_intent_id, payment_domain,
        order_payment_id, raffle_order_id, fantasy_entry_id,
        amount_cents, fee_cents, net_cents, currency, movement_type,
        reporting_category, provider_created_at, evidence
      ) values (
        movement_id, target_dispute_id, target_payment_intent_id, domain_name,
        case when domain_name = 'order' then original.id else null end,
        case when domain_name = 'raffle' then raffle.id else null end,
        case when domain_name = 'dino_coach' then dino.id else null end,
        movement_amount, movement_fee, movement_net, movement_currency,
        movement ->> 'type', movement ->> 'reporting_category',
        movement_created_at, movement
      ) on conflict (balance_transaction_id) do nothing
      returning true into movement_inserted;
      movement_inserted := coalesce(movement_inserted, false);
      if not movement_inserted then
        select * into existing_movement
          from public.stripe_dispute_balance_movements
          where balance_transaction_id = movement_id;
        if existing_movement.dispute_id <> target_dispute_id
          or existing_movement.payment_intent_id <> target_payment_intent_id
          or existing_movement.payment_domain <> domain_name
          or existing_movement.amount_cents <> movement_amount
          or existing_movement.fee_cents <> movement_fee
          or existing_movement.net_cents <> movement_net
          or existing_movement.currency <> movement_currency then
          raise exception 'Conflicting Stripe Balance Transaction identity.'
            using errcode = 'integrity_constraint_violation';
        end if;
      else
        movement_count := movement_count + 1;
      end if;

      if domain_name = 'order' and movement_amount <> 0
        and not exists (
          select 1 from public.order_payments
          where provider = 'stripe' and provider_event_id = movement_id
        ) then
        canonical_reference := public.allocate_payment_reference(
          coalesce(ordinary_order.order_category, 'general'), movement_created_at
        );
        insert into public.order_payments(
          order_id, payment_reference, amount, currency, method, provider,
          provider_reference, provider_event_id, status, received_at, recorded_by,
          reverses_payment_id, notes, metadata
        ) values (
          original.order_id, canonical_reference, abs(movement_amount)::numeric / 100,
          'AUD', 'stripe', 'stripe', target_dispute_id, movement_id,
          case when movement_amount < 0 then 'disputed' else 'recovered' end,
          movement_created_at, 'stripe-webhook', original.id,
          case when movement_amount < 0
            then 'Stripe dispute funds withdrawn'
            else 'Stripe dispute funds reinstated' end,
          pg_catalog.jsonb_build_object(
            'payment_intent', target_payment_intent_id,
            'stripe_dispute_id', target_dispute_id,
            'stripe_balance_transaction_id', movement_id,
            'signed_amount_cents', movement_amount,
            'stripe_event_type', target_event_type
          )
        );
      end if;
    end loop;
  end if;

  select coalesce(sum(amount_refunded_cents), 0)::integer
    into total_refunded_cents
    from public.stripe_charge_refund_snapshots as refund_snapshot
    where refund_snapshot.payment_domain = domain_name
      and ((domain_name = 'order' and refund_snapshot.order_payment_id = original.id)
        or (domain_name = 'raffle' and refund_snapshot.raffle_order_id = raffle.id)
        or (domain_name = 'dino_coach' and refund_snapshot.fantasy_entry_id = dino.id));

  select count(*)::integer into active_disputes
    from public.stripe_disputes as dispute_snapshot
    where dispute_snapshot.payment_domain = domain_name
      and dispute_snapshot.status in ('needs_response', 'under_review', 'lost')
      and ((domain_name = 'order' and dispute_snapshot.order_payment_id = original.id)
        or (domain_name = 'raffle' and dispute_snapshot.raffle_order_id = raffle.id)
        or (domain_name = 'dino_coach' and dispute_snapshot.fantasy_entry_id = dino.id));

  if domain_name = 'order' then
    if target_event_type = 'charge.refunded' then
      select coalesce(round(sum(amount) * 100), 0)::integer
        into already_recorded_refund_cents
        from public.order_payments
        where reverses_payment_id = original.id and status = 'refunded';
      refund_delta_cents := greatest(total_refunded_cents - already_recorded_refund_cents, 0);
      if refund_delta_cents > 0 then
        canonical_reference := public.allocate_payment_reference(
          coalesce(ordinary_order.order_category, 'general'), target_event_created_at
        );
        insert into public.order_payments(
          order_id, payment_reference, amount, currency, method, provider,
          provider_reference, provider_event_id, status, received_at, recorded_by,
          reverses_payment_id, notes, metadata
        ) values (
          original.order_id, canonical_reference, refund_delta_cents::numeric / 100,
          'AUD', 'stripe', 'stripe', target_charge_id, target_provider_event_id,
          'refunded', coalesce(target_event_created_at, pg_catalog.now()),
          'stripe-webhook', original.id, 'Stripe refund',
          pg_catalog.jsonb_build_object(
            'payment_intent', target_payment_intent_id,
            'stripe_charge_id', target_charge_id,
            'cumulative_refund_cents', total_refunded_cents,
            'stripe_event_type', target_event_type
          )
        );
      end if;
    end if;
    select payment_status into after_status from public.orders where id = original.order_id;
  elsif domain_name = 'raffle' then
    after_status := case
      when active_disputes > 0 then 'disputed'
      when total_refunded_cents >= raffle.amount_cents then 'refunded'
      when total_refunded_cents > 0 then 'partially_refunded'
      when raffle.paid_at is not null then 'paid'
      else raffle.status
    end;
    update public.raffle_orders set
      refunded_amount_cents = least(total_refunded_cents, amount_cents),
      status = after_status,
      updated_at = pg_catalog.now()
    where id = raffle.id;
    if active_disputes > 0 or total_refunded_cents > 0 then
      update public.raffle_tickets as ticket set
        voided_at = coalesce(voided_at, target_event_created_at, pg_catalog.now()),
        void_reason = case
          when active_disputes > 0 then 'stripe_dispute'
          when total_refunded_cents >= raffle.amount_cents then 'stripe_refund'
          else 'partial_refund_pending_review'
        end
      where ticket.raffle_order_id = raffle.id;
    else
      update public.raffle_tickets as ticket set voided_at = null, void_reason = null
      where ticket.raffle_order_id = raffle.id
        and ticket.void_reason in ('stripe_dispute', 'stripe_refund', 'partial_refund_pending_review');
    end if;
  else
    after_status := case
      when active_disputes > 0 then 'disputed'
      when total_refunded_cents >= dino.entry_fee_cents then 'refunded'
      when total_refunded_cents > 0 then 'suspended'
      when dino.paid_at is not null then 'paid'
      else dino.status
    end;
    update public.fantasy_entries set
      refunded_amount_cents = least(total_refunded_cents, entry_fee_cents),
      refunded_at = case
        when total_refunded_cents >= entry_fee_cents
          then coalesce(refunded_at, target_event_created_at, pg_catalog.now())
        else refunded_at
      end,
      status = after_status,
      updated_at = pg_catalog.now()
    where id = dino.id;
  end if;

  changed := before_status is distinct from after_status;
  update public.stripe_payment_events
    set applied_at = coalesce(applied_at, pg_catalog.now())
    where provider_event_id = target_provider_event_id;
  return query select true, event_was_duplicate, false, domain_name,
    case when domain_name = 'order' then original.order_id else null end,
    case when domain_name = 'raffle' then raffle.id else null end,
    case when domain_name = 'dino_coach' then dino.id else null end,
    after_status, changed, movement_count;
end;
$$;

revoke all on function public.apply_stripe_financial_event(
  text, text, text, timestamptz, text, text, integer, integer,
  text, text, text, integer, timestamptz, timestamptz, jsonb, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_stripe_financial_event(
  text, text, text, timestamptz, text, text, integer, integer,
  text, text, text, integer, timestamptz, timestamptz, jsonb, boolean, jsonb
) to service_role;

-- Generic Checkout settlement must acquire the same PI lock before locking
-- its ledger row. This closes the only no-link/pending race while retaining
-- the append-only order ledger and its existing total/receipt triggers.
create or replace function public.settle_stripe_order_payment(
  target_payment_id uuid,
  target_order_id uuid,
  target_checkout_session_id text,
  target_payment_intent_id text,
  target_provider_event_id text,
  target_provider_created_at timestamptz,
  target_amount_cents integer,
  target_payment_reference text,
  target_recorded_by text,
  target_metadata jsonb
) returns table(duplicate boolean, payment_id uuid, settled_order_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.order_payments%rowtype;
begin
  if target_payment_id is null
    or target_order_id is null
    or coalesce(target_checkout_session_id, '') !~ '^cs_'
    or coalesce(target_payment_intent_id, '') !~ '^pi_'
    or coalesce(target_provider_event_id, '') !~ '^evt_'
    or target_provider_created_at is null
    or coalesce(target_amount_cents, 0) <= 0
    or coalesce(target_payment_reference, '')
      !~ '^(NDCC(MER|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
    or coalesce(target_recorded_by, '') not in ('stripe-webhook', 'stripe-webhook-legacy-upgrade')
    or pg_catalog.jsonb_typeof(coalesce(target_metadata, '{}'::jsonb)) <> 'object'
    or target_metadata ->> 'payment_intent' is distinct from target_payment_intent_id
    or target_metadata ->> 'payment_reference' is distinct from target_payment_reference
    or target_metadata ->> 'item_number' is distinct from target_payment_reference then
    raise exception 'Invalid Stripe order settlement contract.' using errcode = 'check_violation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_payment_intent_id, 614749110)
  );
  select * into payment from public.order_payments
    where id = target_payment_id for update;
  if not found
    or payment.order_id is distinct from target_order_id
    or payment.provider is distinct from 'stripe'
    or payment.method is distinct from 'stripe'
    or payment.provider_reference is distinct from target_checkout_session_id
    or upper(coalesce(payment.currency, '')) <> 'AUD'
    or round(payment.amount * 100)::integer <> target_amount_cents
    or payment.payment_reference is distinct from target_payment_reference
    or payment.status not in ('pending', 'failed', 'settled')
    or (payment.metadata ->> 'payment_intent' is not null
      and payment.metadata ->> 'payment_intent' <> target_payment_intent_id) then
    raise exception 'Stripe order ledger settlement mismatch.'
      using errcode = 'integrity_constraint_violation';
  end if;

  if payment.status = 'settled' then
    if payment.metadata ->> 'payment_intent' is distinct from target_payment_intent_id then
      raise exception 'Settled Stripe order payment has no matching PaymentIntent.'
        using errcode = 'integrity_constraint_violation';
    end if;
    return query select true, payment.id, payment.order_id;
    return;
  end if;

  update public.order_payments set
    status = 'settled',
    provider_event_id = target_provider_event_id,
    received_at = target_provider_created_at,
    recorded_by = target_recorded_by,
    metadata = coalesce(payment.metadata, '{}'::jsonb) || target_metadata
  where id = payment.id;
  return query select false, payment.id, payment.order_id;
end;
$$;

revoke all on function public.settle_stripe_order_payment(
  uuid, uuid, text, text, text, timestamptz, integer, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.settle_stripe_order_payment(
  uuid, uuid, text, text, text, timestamptz, integer, text, text, jsonb
) to service_role;

-- Deployment-gap compatibility. Under a row lock, validate the legacy
-- Checkout identity and attach a canonical payment-level reference before the
-- webhook upgrades the PaymentIntent metadata and settles it.
create or replace function public.ensure_legacy_stripe_payment_reference(
  target_payment_domain text,
  target_record_id uuid,
  target_checkout_session_id text,
  target_payment_intent_id text,
  target_amount_cents integer,
  target_order_category text,
  target_payment_kind text,
  target_legacy_reference text
) returns table(payment_reference text, payment_type text, ledger_payment_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ordinary_order public.orders%rowtype;
  payment public.order_payments%rowtype;
  raffle public.raffle_orders%rowtype;
  dino public.fantasy_entries%rowtype;
  canonical_category text;
  canonical_reference text;
  payment_id uuid;
begin
  if target_payment_domain not in ('order', 'raffle', 'dino_coach')
    or target_record_id is null
    or coalesce(target_checkout_session_id, '') = ''
    or coalesce(target_payment_intent_id, '') = ''
    or target_checkout_session_id !~ '^cs_'
    or target_payment_intent_id !~ '^pi_'
    or coalesce(target_amount_cents, 0) <= 0 then
    raise exception 'Invalid legacy Stripe settlement identity.' using errcode = 'check_violation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_payment_intent_id, 614749110)
  );

  if target_payment_domain = 'order' then
    if target_payment_kind not in ('partial', 'balance') then
      raise exception 'Invalid legacy order payment kind.' using errcode = 'check_violation';
    end if;
    select * into ordinary_order from public.orders where id = target_record_id for update;
    if not found then raise exception 'Legacy Stripe order not found.' using errcode = 'no_data_found'; end if;
    canonical_category := public.normalise_payment_reference_category(ordinary_order.order_category);
    select * into payment from public.order_payments
      where provider = 'stripe' and provider_reference = target_checkout_session_id
      for update;
    if public.normalise_payment_reference_category(target_order_category) <> canonical_category
      or coalesce(target_legacy_reference, '') <> coalesce(ordinary_order.payment_reference, ordinary_order.id::text) then
      raise exception 'Legacy Stripe order contract mismatch.' using errcode = 'check_violation';
    end if;
    if found then
      if payment.order_id <> ordinary_order.id
        or round(payment.amount * 100)::integer <> target_amount_cents
        or (payment.metadata ->> 'payment_intent' is not null
          and payment.metadata ->> 'payment_intent' <> target_payment_intent_id)
        or payment.status not in ('pending', 'failed', 'settled') then
        raise exception 'Legacy Stripe ledger contract mismatch.' using errcode = 'integrity_constraint_violation';
      end if;
      canonical_reference := payment.payment_reference;
      payment_id := payment.id;
    elsif ordinary_order.stripe_session_id is distinct from target_checkout_session_id then
      -- Legacy checkout overwrote this lossy order-level pointer whenever a
      -- newer part-payment Session was created. An exact ledger row above is
      -- therefore authoritative; the pointer is required only when no ledger
      -- row exists and this helper would otherwise have to synthesise one.
      raise exception 'Legacy Stripe order session is not linked.' using errcode = 'check_violation';
    end if;
    if canonical_reference is null then
      canonical_reference := public.allocate_payment_reference(canonical_category, pg_catalog.now());
    end if;
    if payment_id is null then
      insert into public.order_payments(
        order_id, payment_reference, amount, currency, method, provider,
        provider_reference, status, recorded_by, metadata
      ) values (
        ordinary_order.id, canonical_reference, target_amount_cents::numeric / 100,
        'AUD', 'stripe', 'stripe', target_checkout_session_id, 'pending',
        'stripe-webhook-legacy-upgrade', pg_catalog.jsonb_build_object(
          'order_category', canonical_category,
          'payment_kind', target_payment_kind,
          'payment_reference', canonical_reference,
          'payment_intent', target_payment_intent_id,
          'item_number', canonical_reference,
          'legacy_reference', target_legacy_reference
        )
      ) returning id into payment_id;
    elsif payment.status <> 'settled' then
      update public.order_payments set
        payment_reference = canonical_reference,
        metadata = payment.metadata || pg_catalog.jsonb_build_object(
          'order_category', canonical_category,
          'payment_kind', target_payment_kind,
          'payment_reference', canonical_reference,
          'payment_intent', target_payment_intent_id,
          'item_number', canonical_reference,
          'legacy_reference', target_legacy_reference
        )
      where id = payment_id;
    elsif payment.metadata ->> 'payment_intent' is distinct from target_payment_intent_id then
      raise exception 'Settled legacy Stripe ledger is linked to another PaymentIntent.'
        using errcode = 'integrity_constraint_violation';
    end if;
    update public.orders set stripe_session_id = coalesce(stripe_session_id, target_checkout_session_id)
      where id = ordinary_order.id;
  elsif target_payment_domain = 'raffle' then
    select * into raffle from public.raffle_orders where id = target_record_id for update;
    if not found or raffle.amount_cents <> target_amount_cents
      or (raffle.stripe_checkout_session_id is not null
        and raffle.stripe_checkout_session_id <> target_checkout_session_id)
      or (raffle.stripe_payment_intent_id is not null
        and raffle.stripe_payment_intent_id <> target_payment_intent_id) then
      raise exception 'Legacy raffle Checkout contract mismatch.' using errcode = 'check_violation';
    end if;
    canonical_category := 'raffle';
    canonical_reference := coalesce(
      raffle.payment_reference,
      public.allocate_payment_reference('raffle', pg_catalog.now())
    );
    update public.raffle_orders set
      payment_reference = canonical_reference,
      stripe_checkout_session_id = coalesce(stripe_checkout_session_id, target_checkout_session_id),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, target_payment_intent_id),
      updated_at = pg_catalog.now()
    where id = raffle.id;
  else
    select * into dino from public.fantasy_entries where id = target_record_id for update;
    if not found or dino.entry_fee_cents <> target_amount_cents
      or (dino.stripe_payment_intent_id is not null
        and dino.stripe_payment_intent_id <> target_payment_intent_id) then
      raise exception 'Legacy Dino Coach Checkout contract mismatch.' using errcode = 'check_violation';
    end if;
    canonical_category := 'dino_coach';
    canonical_reference := coalesce(
      dino.payment_reference,
      public.allocate_payment_reference('dino_coach', pg_catalog.now())
    );
    update public.fantasy_entries set
      payment_reference = canonical_reference,
      stripe_checkout_session_id = target_checkout_session_id,
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, target_payment_intent_id),
      updated_at = pg_catalog.now()
    where id = dino.id;
  end if;

  return query select canonical_reference, canonical_category, payment_id;
end;
$$;

revoke all on function public.ensure_legacy_stripe_payment_reference(
  text, uuid, text, text, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.ensure_legacy_stripe_payment_reference(
  text, uuid, text, text, integer, text, text, text
) to service_role;

-- Settlement stays independently idempotent. PaymentIntent is mandatory so
-- a pending signed financial event can be linked and replayed afterward.
create or replace function public.issue_paid_raffle_tickets(
  target_order_id uuid,
  target_provider_event_id text,
  target_session_id text,
  target_payment_intent_id text
) returns table(ticket_reference text, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.raffle_orders%rowtype;
  campaign public.raffle_campaigns%rowtype;
  existing_event public.raffle_payment_events%rowtype;
  event_inserted boolean := false;
  start_number integer;
  counter integer;
  active_disputes integer := 0;
  total_refunded_cents integer := 0;
  final_status text;
begin
  if coalesce(target_payment_intent_id, '') = ''
    or target_payment_intent_id !~ '^pi_'
    or coalesce(target_provider_event_id, '') !~ '^evt_'
    or coalesce(target_session_id, '') !~ '^cs_' then
    raise exception 'Raffle settlement requires a PaymentIntent.' using errcode = 'check_violation';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_payment_intent_id, 614749110)
  );
  select * into target_order from public.raffle_orders
    where id = target_order_id for update;
  if not found then raise exception 'Raffle order not found'; end if;
  if target_order.stripe_payment_intent_id is not null
    and target_order.stripe_payment_intent_id <> target_payment_intent_id then
    raise exception 'Raffle PaymentIntent mismatch.' using errcode = 'integrity_constraint_violation';
  end if;

  insert into public.raffle_payment_events(
    provider_event_id, raffle_order_id, event_type, provider_created_at
  ) values (
    target_provider_event_id, target_order.id, 'paid', pg_catalog.now()
  ) on conflict (provider_event_id) do nothing
  returning true into event_inserted;
  event_inserted := coalesce(event_inserted, false);
  if not event_inserted then
    select * into existing_event from public.raffle_payment_events
      where provider_event_id = target_provider_event_id;
    if existing_event.raffle_order_id <> target_order.id or existing_event.event_type <> 'paid' then
      raise exception 'Conflicting duplicate raffle payment event.' using errcode = 'integrity_constraint_violation';
    end if;
    return query select ticket.ticket_reference, true
      from public.raffle_tickets ticket
      where ticket.raffle_order_id = target_order.id
      order by ticket.ticket_number;
    return;
  end if;

  select * into campaign from public.raffle_campaigns
    where id = target_order.campaign_id for update;
  if exists (
    select 1 from public.raffle_tickets where raffle_order_id = target_order.id
  ) then
    return query select ticket.ticket_reference, true
      from public.raffle_tickets ticket
      where ticket.raffle_order_id = target_order.id
      order by ticket.ticket_number;
    return;
  end if;
  if campaign.next_ticket_number + target_order.quantity - 1 > 9999 then
    raise exception 'Raffle ticket allocation exhausted';
  end if;
  if target_order.status = 'paid' then
    raise exception 'Paid raffle order has no allocated tickets.'
      using errcode = 'integrity_constraint_violation';
  end if;

  start_number := campaign.next_ticket_number;
  for counter in 0..target_order.quantity - 1 loop
    insert into public.raffle_tickets(
      raffle_order_id, campaign_id, ticket_number, ticket_reference
    ) values (
      target_order.id, campaign.id, start_number + counter,
      campaign.code || '-' || campaign.year_code || lpad((start_number + counter)::text, 4, '0')
    );
  end loop;
  update public.raffle_campaigns
    set next_ticket_number = start_number + target_order.quantity,
        updated_at = pg_catalog.now()
    where id = campaign.id;
  update public.raffle_orders
    set status = 'paid',
        stripe_checkout_session_id = target_session_id,
        stripe_payment_intent_id = target_payment_intent_id,
        paid_at = coalesce(paid_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where id = target_order.id;
  select count(*)::integer into active_disputes
    from public.stripe_disputes
    where raffle_order_id = target_order.id
      and status in ('needs_response', 'under_review', 'lost');
  select coalesce(sum(amount_refunded_cents), 0)::integer into total_refunded_cents
    from public.stripe_charge_refund_snapshots
    where raffle_order_id = target_order.id;
  final_status := case
    when active_disputes > 0 then 'disputed'
    when total_refunded_cents >= target_order.amount_cents then 'refunded'
    when total_refunded_cents > 0 then 'partially_refunded'
    else 'paid'
  end;
  update public.raffle_orders set
    refunded_amount_cents = least(total_refunded_cents, amount_cents),
    status = final_status,
    updated_at = pg_catalog.now()
  where id = target_order.id;
  if final_status <> 'paid' then
    update public.raffle_tickets set
      voided_at = coalesce(voided_at, pg_catalog.now()),
      void_reason = case
        when final_status = 'disputed' then 'stripe_dispute'
        when final_status = 'refunded' then 'stripe_refund'
        else 'partial_refund_pending_review'
      end
    where raffle_order_id = target_order.id;
  end if;
  return query select ticket.ticket_reference, false
    from public.raffle_tickets ticket
    where ticket.raffle_order_id = target_order.id
    order by ticket.ticket_number;
end;
$$;

revoke all on function public.issue_paid_raffle_tickets(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.issue_paid_raffle_tickets(uuid, text, text, text)
  to service_role;

-- Checkout lifecycle only. Financial state is overlaid from all formal
-- dispute snapshots and independent refunds, never from current-status guards.
create or replace function public.apply_dino_entry_payment_event(
  target_entry_id uuid,
  target_provider_event_id text,
  target_provider_event_type text,
  target_provider_created_at timestamptz,
  target_resulting_status text,
  target_checkout_session_id text,
  target_payment_intent_id text,
  target_evidence jsonb
) returns table(duplicate boolean, entry_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_event public.fantasy_entry_payment_events%rowtype;
  previous_event public.fantasy_entry_payment_events%rowtype;
  current_entry public.fantasy_entries%rowtype;
  event_inserted boolean := false;
  should_apply boolean := true;
  previous_rank integer;
  target_rank integer;
  active_disputes integer := 0;
  derived_status text;
begin
  if coalesce(target_provider_event_id, '') = ''
    or target_provider_event_id !~ '^evt_'
    or target_provider_event_type not in (
      'checkout.session.completed', 'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed', 'checkout.session.expired'
    )
    or target_resulting_status not in ('paid', 'failed', 'expired')
    or (target_payment_intent_id is not null and target_payment_intent_id !~ '^pi_')
    or (target_resulting_status = 'paid' and (
      coalesce(target_payment_intent_id, '') = ''
      or target_payment_intent_id !~ '^pi_'
      or coalesce(target_checkout_session_id, '') !~ '^cs_'
    )) then
    raise exception 'Invalid Dino Coach Checkout event.' using errcode = 'check_violation';
  end if;

  if target_payment_intent_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(target_payment_intent_id, 614749110)
    );
  end if;

  select * into current_entry from public.fantasy_entries
    where id = target_entry_id for update;
  if not found then raise exception 'Dino Coach entry not found.' using errcode = 'no_data_found'; end if;
  if target_payment_intent_id is not null
    and current_entry.stripe_payment_intent_id is not null
    and current_entry.stripe_payment_intent_id <> target_payment_intent_id then
    raise exception 'Dino Coach PaymentIntent mismatch.' using errcode = 'integrity_constraint_violation';
  end if;

  insert into public.fantasy_entry_payment_events(
    entry_id, provider_event_id, provider_event_type, provider_created_at,
    resulting_status, evidence
  ) values (
    target_entry_id, target_provider_event_id, target_provider_event_type,
    target_provider_created_at, target_resulting_status,
    coalesce(target_evidence, '{}'::jsonb)
  ) on conflict (provider_event_id) do nothing
  returning true into event_inserted;
  event_inserted := coalesce(event_inserted, false);

  if not event_inserted then
    select * into existing_event from public.fantasy_entry_payment_events
      where provider_event_id = target_provider_event_id;
    if existing_event.entry_id <> target_entry_id
      or existing_event.provider_event_type <> target_provider_event_type
      or existing_event.resulting_status <> target_resulting_status then
      raise exception 'Conflicting duplicate Dino Coach payment event.' using errcode = 'integrity_constraint_violation';
    end if;
  else
    select * into previous_event
      from public.fantasy_entry_payment_events
      where entry_id = target_entry_id
        and provider_event_id <> target_provider_event_id
        and provider_event_type like 'checkout.session.%'
      order by provider_created_at desc nulls last, created_at desc
      limit 1;
    previous_rank := case previous_event.resulting_status
      when 'paid' then 3 when 'failed' then 2 when 'expired' then 1 else 0 end;
    target_rank := case target_resulting_status
      when 'paid' then 3 when 'failed' then 2 when 'expired' then 1 else 0 end;
    if previous_event.id is not null then
      if previous_event.provider_created_at > target_provider_created_at
        or (previous_event.provider_created_at = target_provider_created_at
          and previous_rank > target_rank) then
        should_apply := false;
      end if;
    end if;

    if should_apply then
      update public.fantasy_entries set
        status = target_resulting_status,
        provider_event_id = target_provider_event_id,
        stripe_checkout_session_id = coalesce(target_checkout_session_id, stripe_checkout_session_id),
        stripe_payment_intent_id = coalesce(target_payment_intent_id, stripe_payment_intent_id),
        paid_at = case
          when target_resulting_status = 'paid' then coalesce(paid_at, target_provider_created_at)
          else paid_at
        end,
        updated_at = pg_catalog.now()
      where id = target_entry_id
      returning * into current_entry;
    end if;
  end if;

  select count(*)::integer into active_disputes
    from public.stripe_disputes
    where fantasy_entry_id = target_entry_id
      and status in ('needs_response', 'under_review', 'lost');
  derived_status := case
    when active_disputes > 0 then 'disputed'
    when current_entry.refunded_amount_cents >= current_entry.entry_fee_cents then 'refunded'
    when current_entry.refunded_amount_cents > 0 then 'suspended'
    when current_entry.paid_at is not null then 'paid'
    else current_entry.status
  end;
  update public.fantasy_entries set status = derived_status, updated_at = pg_catalog.now()
    where id = target_entry_id
    returning * into current_entry;
  return query select not event_inserted, current_entry.status;
end;
$$;

revoke all on function public.apply_dino_entry_payment_event(uuid, text, text, timestamptz, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_dino_entry_payment_event(uuid, text, text, timestamptz, text, text, text, jsonb)
  to service_role;

-- Explicit child-first cleanup plus cascading FKs keeps the existing atomic
-- test-order deletion compatible with financial audit rows.
create or replace function public.delete_test_order_atomic(p_order_id uuid, p_confirmation text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_order orders%rowtype;
  result jsonb;
begin
  if p_confirmation <> 'DELETE TEST ORDER' then raise exception 'Typed confirmation is incorrect.'; end if;
  select * into target_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if not (lower(coalesce(target_order.notes, '')) ~ '(dummy|test)'
    or lower(coalesce(target_order.payment_reference, '')) ~ '(dummy|test)') then
    raise exception 'Order is not explicitly marked as dummy/test.';
  end if;
  result := preview_test_order_cleanup(p_order_id);
  perform set_config('ndcc.allow_test_order_cleanup', 'on', true);
  update event_registrations set order_id = null where order_id = p_order_id;
  update kitchen_orders set linked_order_id = null where linked_order_id = p_order_id;
  update imported_transactions set matched_order_id = null where matched_order_id = p_order_id;
  update member_applications set order_id = null where order_id = p_order_id;
  delete from bank_transfer_confirmations where order_id = p_order_id;
  delete from stripe_dispute_balance_movements
    where order_payment_id in (select id from order_payments where order_id = p_order_id);
  delete from stripe_charge_refund_snapshots
    where order_payment_id in (select id from order_payments where order_id = p_order_id);
  delete from stripe_disputes
    where order_payment_id in (select id from order_payments where order_id = p_order_id);
  delete from stripe_payment_events
    where order_payment_id in (select id from order_payments where order_id = p_order_id);
  delete from order_payments where order_id = p_order_id;
  delete from orders where id = p_order_id;
  return result || jsonb_build_object('deleted', true, 'order_id', p_order_id);
end;
$$;

revoke all on function public.delete_test_order_atomic(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_test_order_atomic(uuid, text) to service_role;

notify pgrst, 'reload schema';
