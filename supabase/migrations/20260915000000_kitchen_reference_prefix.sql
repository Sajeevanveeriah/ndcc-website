-- Correct new kitchen references; retain legacy NCDDKIT references without rewriting orders.
-- Definitions preserve the existing settlement, receipt leases and locking semantics.
alter table public.order_payments drop constraint order_payments_payment_reference_format;
alter table public.order_payments add constraint order_payments_payment_reference_format check (payment_reference is null or payment_reference ~ '^(NDCC(MER|KIT|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$');

CREATE OR REPLACE FUNCTION public.enqueue_payment_receipt_job(target_receipt_kind text, target_source_id uuid, target_not_before timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        ~ '^(NDCC(MER|KIT|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
      and replace(payment.payment_reference, 'NDCCKIT-', 'NCDDKIT-') like (
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
$function$
;

CREATE OR REPLACE FUNCTION public.claim_payment_receipt_job(target_job_id uuid, target_worker_id uuid, target_lease_seconds integer DEFAULT 300)
 RETURNS SETOF receipt_delivery_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
              ~ '^(NDCC(MER|KIT|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
            and replace(payment.payment_reference, 'NDCCKIT-', 'NCDDKIT-') like (
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
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_order_stripe_payment(target_order_id uuid, target_payment_reference text, target_amount_cents integer, target_payment_kind text, target_checkout_origin text, target_return_path text)
 RETURNS TABLE(payment_id uuid, available_balance_cents integer, checkout_expires_at_unix bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if clean_return_path not in ('/merchandise', '/kitchen', '/join', '/events', '/sponsors/donate')
    and clean_return_path !~ '^/events/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception 'Invalid Stripe Checkout return path.' using errcode = 'check_violation';
  end if;

  expires_at := reserved_at + interval '1 hour';
  expires_at_unix := pg_catalog.floor(extract(epoch from expires_at))::bigint;

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
    when 'kitchen' then case when target_payment_reference like 'NDCCKIT-%' then 'NDCCKIT' else 'NCDDKIT' end
    when 'membership' then 'NDCCMEM'
    when 'event' then 'NDCCEVT'
    else 'NDCCPAY'
  end;
  if target_payment_reference is null
    or target_payment_reference !~ '^(NDCC(MER|KIT|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
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
      'checkout_created_at_unix', pg_catalog.floor(extract(epoch from reserved_at))::bigint,
      'checkout_expires_at_unix', expires_at_unix,
      'checkout_expires_at', expires_at,
      'checkout_customer_email', coalesce(target_order.customer_email, ''),
      'checkout_order_reference', coalesce(target_order.payment_reference, target_order.id::text)
    )
  ) returning id into inserted_id;

  return query select inserted_id, balance_cents, expires_at_unix;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.allocate_payment_reference(target_category text, target_at timestamp with time zone DEFAULT now())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  canonical_category text;
  category_prefix text;
  melbourne_year smallint;
  sequence_value integer;
begin
  canonical_category := public.normalise_payment_reference_category(target_category);

  category_prefix := case canonical_category
    when 'merch' then 'NDCCMER'
    when 'kitchen' then 'NDCCKIT'
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
$function$
;

CREATE OR REPLACE FUNCTION public.settle_stripe_order_payment(target_payment_id uuid, target_order_id uuid, target_checkout_session_id text, target_payment_intent_id text, target_provider_event_id text, target_provider_created_at timestamp with time zone, target_amount_cents integer, target_payment_reference text, target_recorded_by text, target_metadata jsonb)
 RETURNS TABLE(duplicate boolean, payment_id uuid, settled_order_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      !~ '^(NDCC(MER|KIT|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
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
$function$
;

CREATE OR REPLACE FUNCTION public.preflight_payment_receipt_job(target_job_id uuid, target_worker_id uuid)
 RETURNS TABLE(eligible boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        ~ '^(NDCC(MER|KIT|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
      and replace(payment.payment_reference, 'NDCCKIT-', 'NCDDKIT-') like (
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
$function$
;

CREATE OR REPLACE FUNCTION public.requeue_payment_receipt_job(target_job_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        ~ '^(NDCC(MER|KIT|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$'
      and replace(payment.payment_reference, 'NDCCKIT-', 'NCDDKIT-') like (
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
$function$
;


