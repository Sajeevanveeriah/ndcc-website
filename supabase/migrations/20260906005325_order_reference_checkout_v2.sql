-- Additive wrapper: old sessions and their immutable financial records stay
-- valid. Reserve and freeze the new public-reference version in one transaction.
create or replace function public.reserve_order_stripe_payment_v2(
  target_order_id uuid,
  target_payment_reference text,
  target_amount_cents integer,
  target_payment_kind text,
  target_checkout_origin text,
  target_return_path text
) returns table(payment_id uuid, available_balance_cents integer, checkout_expires_at_unix bigint)
language plpgsql security definer set search_path = '' as $$
declare reservation record;
begin
  select * into strict reservation from public.reserve_order_stripe_payment(
    target_order_id, target_payment_reference, target_amount_cents,
    target_payment_kind, target_checkout_origin, target_return_path
  );
  update public.order_payments
    set metadata = metadata || pg_catalog.jsonb_build_object('ndcc_reference_version', '2')
    where id = reservation.payment_id;
  return query select reservation.payment_id::uuid,
    reservation.available_balance_cents::integer, reservation.checkout_expires_at_unix::bigint;
end;
$$;
revoke all on function public.reserve_order_stripe_payment_v2(uuid,text,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.reserve_order_stripe_payment_v2(uuid,text,integer,text,text,text) to service_role;
