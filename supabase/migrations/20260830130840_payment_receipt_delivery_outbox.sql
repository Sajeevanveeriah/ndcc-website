-- Durable customer-receipt delivery for every website payment surface.
--
-- Payment state and the queue row are committed in the same database
-- transaction with a short safety hold. The application releases that hold
-- after its financial replay completes and normally attempts delivery at
-- once; a worker retries durable failures. A stable source identity, rather
-- than a provider event ID, makes duplicate and reordered provider events
-- converge on one job.
--
-- Rollback (only before relying on queued work):
--   drop the three enqueue triggers and their trigger functions;
--   drop enqueue_payment_receipt_job, claim_payment_receipt_jobs,
--     claim_payment_receipt_job,
--     preflight_payment_receipt_job,
--     finish_payment_receipt_job and requeue_payment_receipt_job;
--   drop receipt_delivery_jobs;
--   optionally drop the three customer_receipt_* columns from
--     fantasy_entries.

create table if not exists public.receipt_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  receipt_kind text not null
    check (receipt_kind in ('order_payment', 'raffle_order', 'dino_entry')),
  order_payment_id uuid references public.order_payments(id) on delete cascade,
  raffle_order_id uuid references public.raffle_orders(id) on delete cascade,
  dino_entry_id uuid references public.fantasy_entries(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'retry', 'delivered', 'cancelled', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 12 check (max_attempts between 1 and 50),
  next_attempt_at timestamptz default now(),
  locked_at timestamptz,
  lease_expires_at timestamptz,
  locked_by uuid,
  delivered_at timestamptz,
  provider_message_id text,
  receipt_filename text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipt_delivery_jobs_one_source check (
    num_nonnulls(order_payment_id, raffle_order_id, dino_entry_id) = 1
    and (receipt_kind <> 'order_payment' or order_payment_id is not null)
    and (receipt_kind <> 'raffle_order' or raffle_order_id is not null)
    and (receipt_kind <> 'dino_entry' or dino_entry_id is not null)
  ),
  constraint receipt_delivery_jobs_terminal_state check (
    (status = 'delivered' and delivered_at is not null and next_attempt_at is null)
    or (status <> 'delivered' and delivered_at is null)
  ),
  constraint receipt_delivery_jobs_lease_state check (
    (
      status = 'processing'
      and locked_at is not null
      and lease_expires_at is not null
      and lease_expires_at > locked_at
      and locked_by is not null
    )
    or (
      status <> 'processing'
      and locked_at is null
      and lease_expires_at is null
      and locked_by is null
    )
  ),
  constraint receipt_delivery_jobs_schedule_state check (
    (status in ('queued', 'retry') and next_attempt_at is not null)
    or (status not in ('queued', 'retry') and next_attempt_at is null)
  ),
  unique (order_payment_id),
  unique (raffle_order_id),
  unique (dino_entry_id)
);

create index if not exists receipt_delivery_jobs_due_idx
  on public.receipt_delivery_jobs(next_attempt_at, created_at)
  where status in ('queued', 'retry');
create index if not exists receipt_delivery_jobs_stale_lease_idx
  on public.receipt_delivery_jobs(lease_expires_at)
  where status = 'processing';

alter table public.receipt_delivery_jobs enable row level security;
revoke all on table public.receipt_delivery_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.receipt_delivery_jobs to service_role;

-- Dino Coach previously stored a receipt marker against a Stripe Event. A
-- source-level marker survives event reordering and records identity-based
-- delivery without mutating financial-event evidence.
alter table public.fantasy_entries
  add column if not exists customer_receipt_sent_at timestamptz,
  add column if not exists customer_receipt_message_id text,
  add column if not exists customer_receipt_filename text;

create or replace function public.enqueue_payment_receipt_job(
  target_receipt_kind text,
  target_source_id uuid,
  target_not_before timestamptz default pg_catalog.now()
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued_job_id uuid;
  available_at timestamptz := coalesce(target_not_before, pg_catalog.now());
  source_payment_intent text;
begin
  if target_source_id is null then
    raise exception 'A receipt-delivery source ID is required.'
      using errcode = 'null_value_not_allowed';
  end if;

  if target_receipt_kind = 'order_payment' then
    -- Read the PaymentIntent without taking a row lock, acquire the same
    -- transaction lock as settlement/refund/dispute RPCs, then re-read and
    -- lock the source. This lock order prevents a queued financial change
    -- from being overtaken by receipt authorization.
    select case
        when payment.method = 'stripe' then payment.metadata ->> 'payment_intent'
        else null
      end
      into source_payment_intent
    from public.order_payments as payment
    where payment.id = target_source_id;
    if source_payment_intent ~ '^pi_' then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(source_payment_intent, 614749110)
      );
    end if;

    perform 1
    from public.order_payments as payment
    join public.orders as source_order on source_order.id = payment.order_id
    where payment.id = target_source_id
      and payment.status = 'settled'
      and payment.currency = 'AUD'
      and payment.amount > 0
      and (
        payment.method <> 'stripe'
        or (
          source_payment_intent ~ '^pi_'
          and payment.metadata ->> 'payment_intent' = source_payment_intent
        )
      )
      and payment.payment_reference
        ~ '^(NDCC(MER|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
      and payment.payment_reference like (
        case public.normalise_payment_reference_category(source_order.order_category)
          when 'merch' then 'NDCCMER'
          when 'kitchen' then 'NCDDKIT'
          when 'membership' then 'NDCCMEM'
          when 'event' then 'NDCCEVT'
          when 'raffle' then 'NDCCRAF'
          when 'dino_coach' then 'NDCCDCO'
          else 'NDCCPAY'
        end || '-%'
      )
    for update of payment;
    if not found then
      raise exception 'A settled AUD order payment with a canonical category reference is required.'
        using errcode = 'check_violation';
    end if;

    insert into public.receipt_delivery_jobs(
      receipt_kind, order_payment_id, next_attempt_at
    ) values ('order_payment', target_source_id, available_at)
    on conflict (order_payment_id) do update
      set status = case
            when public.receipt_delivery_jobs.status = 'cancelled' then 'queued'
            else public.receipt_delivery_jobs.status
          end,
          attempts = case
            when public.receipt_delivery_jobs.status = 'cancelled' then 0
            else public.receipt_delivery_jobs.attempts
          end,
          next_attempt_at = least(
            public.receipt_delivery_jobs.next_attempt_at,
            excluded.next_attempt_at
          ),
          last_error = case
            when public.receipt_delivery_jobs.status = 'cancelled' then null
            else public.receipt_delivery_jobs.last_error
          end,
          updated_at = pg_catalog.now()
      where public.receipt_delivery_jobs.status in ('queued', 'retry', 'cancelled')
    returning id into queued_job_id;

    if queued_job_id is null then
      select id into queued_job_id from public.receipt_delivery_jobs
        where order_payment_id = target_source_id;
    end if;
  elsif target_receipt_kind = 'raffle_order' then
    select source.stripe_payment_intent_id into source_payment_intent
    from public.raffle_orders as source
    where source.id = target_source_id;
    if source_payment_intent ~ '^pi_' then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(source_payment_intent, 614749110)
      );
    end if;

    perform 1 from public.raffle_orders as source
      where source.id = target_source_id
        and source.status = 'paid'
        and source.currency = 'aud'
        and source.amount_cents > 0
        and source.stripe_payment_intent_id = source_payment_intent
        and source_payment_intent ~ '^pi_'
        and source.payment_reference ~ '^NDCCRAF-[0-9]{4}-[0-9]{6}$'
      for update;
    if not found then
      raise exception 'A paid AUD raffle order with a canonical payment reference is required.'
        using errcode = 'check_violation';
    end if;

    insert into public.receipt_delivery_jobs(
      receipt_kind, raffle_order_id, next_attempt_at
    ) values ('raffle_order', target_source_id, available_at)
    on conflict (raffle_order_id) do update
      set status = case
            when public.receipt_delivery_jobs.status = 'cancelled' then 'queued'
            else public.receipt_delivery_jobs.status
          end,
          attempts = case
            when public.receipt_delivery_jobs.status = 'cancelled' then 0
            else public.receipt_delivery_jobs.attempts
          end,
          next_attempt_at = least(
            public.receipt_delivery_jobs.next_attempt_at,
            excluded.next_attempt_at
          ),
          last_error = case
            when public.receipt_delivery_jobs.status = 'cancelled' then null
            else public.receipt_delivery_jobs.last_error
          end,
          updated_at = pg_catalog.now()
      where public.receipt_delivery_jobs.status in ('queued', 'retry', 'cancelled')
    returning id into queued_job_id;

    if queued_job_id is null then
      select id into queued_job_id from public.receipt_delivery_jobs
        where raffle_order_id = target_source_id;
    end if;
  elsif target_receipt_kind = 'dino_entry' then
    select source.stripe_payment_intent_id into source_payment_intent
    from public.fantasy_entries as source
    where source.id = target_source_id;
    if source_payment_intent ~ '^pi_' then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(source_payment_intent, 614749110)
      );
    end if;

    perform 1 from public.fantasy_entries as source
      where source.id = target_source_id
        and source.status = 'paid'
        and source.currency = 'AUD'
        and source.entry_fee_cents > 0
        and source.stripe_payment_intent_id = source_payment_intent
        and source_payment_intent ~ '^pi_'
        and source.payment_reference ~ '^NDCCDCO-[0-9]{4}-[0-9]{6}$'
      for update;
    if not found then
      raise exception 'A paid AUD Dino Coach entry with a canonical payment reference is required.'
        using errcode = 'check_violation';
    end if;

    insert into public.receipt_delivery_jobs(
      receipt_kind, dino_entry_id, next_attempt_at
    ) values ('dino_entry', target_source_id, available_at)
    on conflict (dino_entry_id) do update
      set status = case
            when public.receipt_delivery_jobs.status = 'cancelled' then 'queued'
            else public.receipt_delivery_jobs.status
          end,
          attempts = case
            when public.receipt_delivery_jobs.status = 'cancelled' then 0
            else public.receipt_delivery_jobs.attempts
          end,
          next_attempt_at = least(
            public.receipt_delivery_jobs.next_attempt_at,
            excluded.next_attempt_at
          ),
          last_error = case
            when public.receipt_delivery_jobs.status = 'cancelled' then null
            else public.receipt_delivery_jobs.last_error
          end,
          updated_at = pg_catalog.now()
      where public.receipt_delivery_jobs.status in ('queued', 'retry', 'cancelled')
    returning id into queued_job_id;

    if queued_job_id is null then
      select id into queued_job_id from public.receipt_delivery_jobs
        where dino_entry_id = target_source_id;
    end if;
  else
    raise exception 'Unknown receipt-delivery kind.'
      using errcode = 'invalid_parameter_value';
  end if;

  return queued_job_id;
end;
$$;

revoke all on function public.enqueue_payment_receipt_job(text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.enqueue_payment_receipt_job(text, uuid, timestamptz)
  to service_role;

create or replace function public.claim_payment_receipt_job(
  target_job_id uuid,
  target_worker_id uuid,
  target_lease_seconds integer default 300
) returns setof public.receipt_delivery_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_lease_seconds integer := least(
    greatest(coalesce(target_lease_seconds, 300), 60),
    900
  );
  source_payment_intent text;
begin
  if target_job_id is null or target_worker_id is null then
    raise exception 'A receipt-delivery job and worker ID are required.'
      using errcode = 'null_value_not_allowed';
  end if;

  -- Resolve the PI without a row lock. The advisory lock must precede every
  -- job/source row lock so a financial RPC already queued on this PI commits
  -- first; all eligibility predicates below are then evaluated under it.
  select case job.receipt_kind
      when 'order_payment' then case
        when payment.method = 'stripe' then payment.metadata ->> 'payment_intent'
        else null
      end
      when 'raffle_order' then raffle.stripe_payment_intent_id
      when 'dino_entry' then dino.stripe_payment_intent_id
      else null
    end
    into source_payment_intent
  from public.receipt_delivery_jobs as job
  left join public.order_payments as payment
    on job.receipt_kind = 'order_payment' and payment.id = job.order_payment_id
  left join public.raffle_orders as raffle
    on job.receipt_kind = 'raffle_order' and raffle.id = job.raffle_order_id
  left join public.fantasy_entries as dino
    on job.receipt_kind = 'dino_entry' and dino.id = job.dino_entry_id
  where job.id = target_job_id;
  if not found then
    return;
  end if;
  if source_payment_intent ~ '^pi_' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(source_payment_intent, 614749110)
    );
  end if;

  update public.receipt_delivery_jobs as exhausted
    set status = 'dead_letter', next_attempt_at = null,
        locked_at = null, lease_expires_at = null, locked_by = null,
        last_error = coalesce(exhausted.last_error, 'Receipt worker lease expired at the retry limit.'),
        updated_at = pg_catalog.now()
    where exhausted.id = target_job_id
      and exhausted.attempts >= exhausted.max_attempts
      and (
        exhausted.status in ('queued', 'retry')
        or (
          exhausted.status = 'processing'
          and exhausted.lease_expires_at <= pg_catalog.now()
        )
      );

  return query
  update public.receipt_delivery_jobs as job
    set status = 'processing',
        attempts = job.attempts + 1,
        next_attempt_at = null,
        locked_at = pg_catalog.now(),
        lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => safe_lease_seconds),
        locked_by = target_worker_id,
        updated_at = pg_catalog.now()
  where job.id = target_job_id
    and (
      (
        job.status in ('queued', 'retry')
        and job.next_attempt_at <= pg_catalog.now()
        and job.attempts < job.max_attempts
      ) or (
        job.status = 'processing'
        and job.lease_expires_at <= pg_catalog.now()
        and job.attempts < job.max_attempts
      )
    )
    and (
      (
        job.receipt_kind = 'order_payment'
        and exists (
          select 1
          from public.order_payments as payment
          join public.orders as source_order on source_order.id = payment.order_id
          where payment.id = job.order_payment_id
            and payment.status = 'settled'
            and payment.currency = 'AUD'
            and payment.amount > 0
            and payment.payment_reference
              ~ '^(NDCC(MER|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
            and payment.payment_reference like (
              case public.normalise_payment_reference_category(source_order.order_category)
                when 'merch' then 'NDCCMER'
                when 'kitchen' then 'NCDDKIT'
                when 'membership' then 'NDCCMEM'
                when 'event' then 'NDCCEVT'
                when 'raffle' then 'NDCCRAF'
                when 'dino_coach' then 'NDCCDCO'
                else 'NDCCPAY'
              end || '-%'
            )
            and (
              payment.method <> 'stripe'
              or (
                source_payment_intent ~ '^pi_'
                and payment.metadata ->> 'payment_intent' = source_payment_intent
                and not exists (
                  select 1
                  from public.stripe_payment_events as pending_event
                  where pending_event.payment_intent_id = source_payment_intent
                    and pending_event.payment_domain = 'pending'
                )
              )
            )
        )
      )
      or (
        job.receipt_kind = 'raffle_order'
        and exists (
          select 1
          from public.raffle_orders as source
          where source.id = job.raffle_order_id
            and source.status = 'paid'
            and source.currency = 'aud'
            and source.amount_cents > 0
            and source.stripe_payment_intent_id = source_payment_intent
            and source_payment_intent ~ '^pi_'
            and source.payment_reference ~ '^NDCCRAF-[0-9]{4}-[0-9]{6}$'
            and not exists (
              select 1
              from public.stripe_payment_events as pending_event
              where pending_event.payment_intent_id = source_payment_intent
                and pending_event.payment_domain = 'pending'
            )
        )
      )
      or (
        job.receipt_kind = 'dino_entry'
        and exists (
          select 1
          from public.fantasy_entries as source
          where source.id = job.dino_entry_id
            and source.status = 'paid'
            and source.currency = 'AUD'
            and source.entry_fee_cents > 0
            and source.stripe_payment_intent_id = source_payment_intent
            and source_payment_intent ~ '^pi_'
            and source.payment_reference ~ '^NDCCDCO-[0-9]{4}-[0-9]{6}$'
            and not exists (
              select 1
              from public.stripe_payment_events as pending_event
              where pending_event.payment_intent_id = source_payment_intent
                and pending_event.payment_domain = 'pending'
            )
        )
      )
    )
  returning job.*;
end;
$$;

revoke all on function public.claim_payment_receipt_job(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_payment_receipt_job(uuid, uuid, integer)
  to service_role;

-- Batch workers discover candidates without row locks and delegate every
-- authorization to the lock-aware targeted claim. Due work is chosen first,
-- then that finite set is ordered by immutable job ID so every concurrent
-- worker acquires overlapping PI locks in one global order. The targeted
-- UPDATE resolves duplicate discovery atomically.
create or replace function public.claim_payment_receipt_jobs(
  target_worker_id uuid,
  target_limit integer default 5,
  target_lease_seconds integer default 300
) returns setof public.receipt_delivery_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_limit integer := least(
    greatest(coalesce(target_limit, 5), 1),
    25
  );
  safe_scan_limit integer;
  candidate_job_id uuid;
  claimed_job public.receipt_delivery_jobs%rowtype;
  claimed_count integer := 0;
begin
  if target_worker_id is null then
    raise exception 'A receipt-delivery worker ID is required.'
      using errcode = 'null_value_not_allowed';
  end if;
  safe_scan_limit := least(greatest(safe_limit * 10, 25), 250);

  for candidate_job_id in
    select due_job.id
    from (
      select job.id
      from public.receipt_delivery_jobs as job
      where (
        job.status in ('queued', 'retry')
        and job.next_attempt_at <= pg_catalog.now()
      ) or (
        job.status = 'processing'
        and job.lease_expires_at <= pg_catalog.now()
      )
      order by coalesce(job.next_attempt_at, job.lease_expires_at), job.created_at, job.id
      limit safe_scan_limit
    ) as due_job
    order by due_job.id
  loop
    for claimed_job in
      select *
      from public.claim_payment_receipt_job(
        candidate_job_id, target_worker_id, target_lease_seconds
      )
    loop
      return next claimed_job;
      claimed_count := claimed_count + 1;
    end loop;
    exit when claimed_count >= safe_limit;
  end loop;
  return;
end;
$$;

revoke all on function public.claim_payment_receipt_jobs(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_payment_receipt_jobs(uuid, integer, integer)
  to service_role;

-- Re-authorize immediately before the external send. A refund/dispute RPC
-- may start after claim commits; taking the PI lock again makes this check
-- wait for that already-queued financial transaction and observe its final
-- source status and any durable pending replay row.
create or replace function public.preflight_payment_receipt_job(
  target_job_id uuid,
  target_worker_id uuid
) returns table(eligible boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_job public.receipt_delivery_jobs%rowtype;
  source_payment_intent text;
  source_is_eligible boolean := false;
  financial_replay_is_pending boolean := false;
begin
  if target_job_id is null or target_worker_id is null then
    raise exception 'A receipt-delivery job and worker ID are required.'
      using errcode = 'null_value_not_allowed';
  end if;

  -- This first read intentionally takes no row lock. Locking the PI first is
  -- the cross-domain ordering contract shared with migration 15000.
  select case job.receipt_kind
      when 'order_payment' then case
        when payment.method = 'stripe' then payment.metadata ->> 'payment_intent'
        else null
      end
      when 'raffle_order' then raffle.stripe_payment_intent_id
      when 'dino_entry' then dino.stripe_payment_intent_id
      else null
    end
    into source_payment_intent
  from public.receipt_delivery_jobs as job
  left join public.order_payments as payment
    on job.receipt_kind = 'order_payment' and payment.id = job.order_payment_id
  left join public.raffle_orders as raffle
    on job.receipt_kind = 'raffle_order' and raffle.id = job.raffle_order_id
  left join public.fantasy_entries as dino
    on job.receipt_kind = 'dino_entry' and dino.id = job.dino_entry_id
  where job.id = target_job_id;
  if not found then
    raise exception 'Receipt-delivery job was not found.'
      using errcode = 'no_data_found';
  end if;
  if source_payment_intent ~ '^pi_' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(source_payment_intent, 614749110)
    );
  end if;

  select * into current_job
  from public.receipt_delivery_jobs
  where id = target_job_id
  for update;
  if not found
    or current_job.status <> 'processing'
    or current_job.locked_by is distinct from target_worker_id
    or current_job.lease_expires_at is null
    or current_job.lease_expires_at <= pg_catalog.now() then
    raise exception 'Receipt-delivery lease does not belong to this worker.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if current_job.receipt_kind = 'order_payment' then
    select
      payment.status = 'settled'
      and payment.currency = 'AUD'
      and payment.amount > 0
      and payment.payment_reference
        ~ '^(NDCC(MER|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
      and payment.payment_reference like (
        case public.normalise_payment_reference_category(source_order.order_category)
          when 'merch' then 'NDCCMER'
          when 'kitchen' then 'NCDDKIT'
          when 'membership' then 'NDCCMEM'
          when 'event' then 'NDCCEVT'
          when 'raffle' then 'NDCCRAF'
          when 'dino_coach' then 'NDCCDCO'
          else 'NDCCPAY'
        end || '-%'
      )
      and (
        payment.method <> 'stripe'
        or (
          source_payment_intent ~ '^pi_'
          and payment.metadata ->> 'payment_intent' = source_payment_intent
        )
      )
      into source_is_eligible
    from public.order_payments as payment
    join public.orders as source_order on source_order.id = payment.order_id
    where payment.id = current_job.order_payment_id;
  elsif current_job.receipt_kind = 'raffle_order' then
    select
      source.status = 'paid'
      and source.currency = 'aud'
      and source.amount_cents > 0
      and source.stripe_payment_intent_id = source_payment_intent
      and source_payment_intent ~ '^pi_'
      and source.payment_reference ~ '^NDCCRAF-[0-9]{4}-[0-9]{6}$'
      into source_is_eligible
    from public.raffle_orders as source
    where source.id = current_job.raffle_order_id;
  elsif current_job.receipt_kind = 'dino_entry' then
    select
      source.status = 'paid'
      and source.currency = 'AUD'
      and source.entry_fee_cents > 0
      and source.stripe_payment_intent_id = source_payment_intent
      and source_payment_intent ~ '^pi_'
      and source.payment_reference ~ '^NDCCDCO-[0-9]{4}-[0-9]{6}$'
      into source_is_eligible
    from public.fantasy_entries as source
    where source.id = current_job.dino_entry_id;
  end if;
  source_is_eligible := coalesce(source_is_eligible, false);

  if source_payment_intent ~ '^pi_' then
    select exists (
      select 1
      from public.stripe_payment_events as pending_event
      where pending_event.payment_intent_id = source_payment_intent
        and pending_event.payment_domain = 'pending'
    ) into financial_replay_is_pending;
  end if;

  if not source_is_eligible then
    return query select false, 'Receipt source is not currently eligible for delivery.'::text;
  elsif financial_replay_is_pending then
    return query select false, 'Stripe financial replay is still pending.'::text;
  else
    return query select true, null::text;
  end if;
end;
$$;

revoke all on function public.preflight_payment_receipt_job(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.preflight_payment_receipt_job(uuid, uuid)
  to service_role;

create or replace function public.finish_payment_receipt_job(
  target_job_id uuid,
  target_worker_id uuid,
  target_delivered boolean,
  target_provider_message_id text default null,
  target_receipt_filename text default null,
  target_error text default null
) returns table(status text, next_attempt_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_job public.receipt_delivery_jobs%rowtype;
  retry_seconds integer;
  source_is_eligible boolean := true;
begin
  select * into current_job
  from public.receipt_delivery_jobs
  where id = target_job_id
  for update;

  if not found then
    raise exception 'Receipt-delivery job was not found.'
      using errcode = 'no_data_found';
  end if;
  if current_job.status <> 'processing'
    or current_job.locked_by is distinct from target_worker_id then
    raise exception 'Receipt-delivery lease does not belong to this worker.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if current_job.receipt_kind = 'raffle_order' then
    select source.status = 'paid' into source_is_eligible
    from public.raffle_orders as source
    where source.id = current_job.raffle_order_id;
  elsif current_job.receipt_kind = 'dino_entry' then
    select source.status = 'paid' into source_is_eligible
    from public.fantasy_entries as source
    where source.id = current_job.dino_entry_id;
  end if;
  source_is_eligible := coalesce(source_is_eligible, false);

  if not source_is_eligible and not coalesce(target_delivered, false) then
    update public.receipt_delivery_jobs
      set status = 'cancelled', next_attempt_at = null,
          locked_at = null, lease_expires_at = null, locked_by = null,
          last_error = 'Receipt source is no longer paid.',
          updated_at = pg_catalog.now()
      where id = target_job_id;
  elsif target_delivered then
    update public.receipt_delivery_jobs
      set status = 'delivered', next_attempt_at = null,
          locked_at = null, lease_expires_at = null, locked_by = null,
          delivered_at = pg_catalog.now(),
          provider_message_id = nullif(pg_catalog.left(target_provider_message_id, 500), ''),
          receipt_filename = nullif(pg_catalog.left(target_receipt_filename, 500), ''),
          last_error = nullif(pg_catalog.left(target_error, 2000), ''),
          updated_at = pg_catalog.now()
      where id = target_job_id;
  elsif current_job.attempts >= current_job.max_attempts then
    update public.receipt_delivery_jobs
      set status = 'dead_letter', next_attempt_at = null,
          locked_at = null, lease_expires_at = null, locked_by = null,
          last_error = pg_catalog.left(coalesce(nullif(target_error, ''), 'Receipt delivery failed.'), 2000),
          updated_at = pg_catalog.now()
      where id = target_job_id;
  else
    retry_seconds := least(
      21600,
      (60 * pg_catalog.power(2::numeric, least(current_job.attempts - 1, 8)))::integer
    );
    update public.receipt_delivery_jobs
      set status = 'retry',
          next_attempt_at = pg_catalog.now() + pg_catalog.make_interval(secs => retry_seconds),
          locked_at = null, lease_expires_at = null, locked_by = null,
          last_error = pg_catalog.left(coalesce(nullif(target_error, ''), 'Receipt delivery failed.'), 2000),
          updated_at = pg_catalog.now()
      where id = target_job_id;
  end if;

  return query
  select job.status, job.next_attempt_at
  from public.receipt_delivery_jobs as job
  where job.id = target_job_id;
end;
$$;

revoke all on function public.finish_payment_receipt_job(uuid, uuid, boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finish_payment_receipt_job(uuid, uuid, boolean, text, text, text)
  to service_role;

create or replace function public.requeue_payment_receipt_job(
  target_job_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_job public.receipt_delivery_jobs%rowtype;
begin
  select * into current_job
  from public.receipt_delivery_jobs
  where id = target_job_id
  for update;
  if not found then
    raise exception 'Receipt-delivery job was not found.'
      using errcode = 'no_data_found';
  end if;
  if current_job.status not in ('dead_letter', 'cancelled') then
    raise exception 'Only a dead-lettered or cancelled receipt can be explicitly requeued.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if current_job.receipt_kind = 'order_payment' then
    perform 1
    from public.order_payments as payment
    join public.orders as source_order on source_order.id = payment.order_id
    where payment.id = current_job.order_payment_id
      and payment.status = 'settled'
      and payment.currency = 'AUD'
      and payment.amount > 0
      and payment.payment_reference
        ~ '^(NDCC(MER|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
      and payment.payment_reference like (
        case public.normalise_payment_reference_category(source_order.order_category)
          when 'merch' then 'NDCCMER'
          when 'kitchen' then 'NCDDKIT'
          when 'membership' then 'NDCCMEM'
          when 'event' then 'NDCCEVT'
          when 'raffle' then 'NDCCRAF'
          when 'dino_coach' then 'NDCCDCO'
          else 'NDCCPAY'
        end || '-%'
      );
  elsif current_job.receipt_kind = 'raffle_order' then
    perform 1 from public.raffle_orders
      where id = current_job.raffle_order_id
        and status = 'paid'
        and currency = 'aud'
        and amount_cents > 0
        and stripe_payment_intent_id ~ '^pi_'
        and payment_reference ~ '^NDCCRAF-[0-9]{4}-[0-9]{6}$';
  else
    perform 1 from public.fantasy_entries
      where id = current_job.dino_entry_id
        and status = 'paid'
        and currency = 'AUD'
        and entry_fee_cents > 0
        and stripe_payment_intent_id ~ '^pi_'
        and payment_reference ~ '^NDCCDCO-[0-9]{4}-[0-9]{6}$';
  end if;
  if not found then
    raise exception 'Receipt source is not currently eligible for delivery.'
      using errcode = 'check_violation';
  end if;

  update public.receipt_delivery_jobs
    set status = 'queued', attempts = 0, next_attempt_at = pg_catalog.now(),
        locked_at = null, lease_expires_at = null, locked_by = null, delivered_at = null,
        provider_message_id = null, receipt_filename = null,
        last_error = null, updated_at = pg_catalog.now()
    where id = target_job_id;
  return target_job_id;
end;
$$;

revoke all on function public.requeue_payment_receipt_job(uuid)
  from public, anon, authenticated;
grant execute on function public.requeue_payment_receipt_job(uuid)
  to service_role;

create or replace function public.queue_order_payment_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'settled' then
    perform public.enqueue_payment_receipt_job(
      'order_payment', new.id, pg_catalog.now() + pg_catalog.make_interval(mins => 5)
    );
  elsif tg_op = 'UPDATE' and new.status = 'settled'
    and old.status is distinct from new.status then
    perform public.enqueue_payment_receipt_job(
      'order_payment', new.id, pg_catalog.now() + pg_catalog.make_interval(mins => 5)
    );
  end if;
  return new;
end;
$$;

create or replace function public.queue_raffle_order_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'paid' then
    perform public.enqueue_payment_receipt_job(
      'raffle_order', new.id, pg_catalog.now() + pg_catalog.make_interval(mins => 5)
    );
  elsif tg_op = 'UPDATE' and new.status = 'paid'
    and old.status is distinct from new.status then
    perform public.enqueue_payment_receipt_job(
      'raffle_order', new.id, pg_catalog.now() + pg_catalog.make_interval(mins => 5)
    );
  elsif tg_op = 'UPDATE' and old.status = 'paid' and new.status <> 'paid' then
    update public.receipt_delivery_jobs
      set status = 'cancelled', next_attempt_at = null,
          locked_at = null, lease_expires_at = null, locked_by = null,
          last_error = 'Receipt source is no longer paid.',
          updated_at = pg_catalog.now()
      where raffle_order_id = new.id and status in ('queued', 'retry');
  end if;
  return new;
end;
$$;

create or replace function public.queue_dino_entry_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'paid' then
    perform public.enqueue_payment_receipt_job(
      'dino_entry', new.id, pg_catalog.now() + pg_catalog.make_interval(mins => 5)
    );
  elsif tg_op = 'UPDATE' and new.status = 'paid'
    and old.status is distinct from new.status then
    perform public.enqueue_payment_receipt_job(
      'dino_entry', new.id, pg_catalog.now() + pg_catalog.make_interval(mins => 5)
    );
  elsif tg_op = 'UPDATE' and old.status = 'paid' and new.status <> 'paid' then
    update public.receipt_delivery_jobs
      set status = 'cancelled', next_attempt_at = null,
          locked_at = null, lease_expires_at = null, locked_by = null,
          last_error = 'Receipt source is no longer paid.',
          updated_at = pg_catalog.now()
      where dino_entry_id = new.id and status in ('queued', 'retry');
  end if;
  return new;
end;
$$;

revoke all on function public.queue_order_payment_receipt() from public, anon, authenticated;
revoke all on function public.queue_raffle_order_receipt() from public, anon, authenticated;
revoke all on function public.queue_dino_entry_receipt() from public, anon, authenticated;
grant execute on function public.queue_order_payment_receipt() to service_role;
grant execute on function public.queue_raffle_order_receipt() to service_role;
grant execute on function public.queue_dino_entry_receipt() to service_role;

drop trigger if exists order_payments_queue_receipt on public.order_payments;
create trigger order_payments_queue_receipt
  after insert or update of status on public.order_payments
  for each row execute function public.queue_order_payment_receipt();

drop trigger if exists raffle_orders_queue_receipt on public.raffle_orders;
create trigger raffle_orders_queue_receipt
  after insert or update of status on public.raffle_orders
  for each row execute function public.queue_raffle_order_receipt();

drop trigger if exists fantasy_entries_queue_receipt on public.fantasy_entries;
create trigger fantasy_entries_queue_receipt
  after insert or update of status on public.fantasy_entries
  for each row execute function public.queue_dino_entry_receipt();

-- Intentionally do not bulk-enqueue historical settled records. A duplicate
-- provider delivery or an explicit service-role enqueue can recover a known
-- historical receipt only when it already has an eligible canonical payment
-- reference, without unexpectedly emailing the full payment history.

notify pgrst, 'reload schema';
