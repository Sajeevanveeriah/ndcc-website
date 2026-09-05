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

