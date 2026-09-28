-- Spin the Wheel follow-up (review on #278): payments that settle after a
-- wheel has closed, whichever way they arrive (a late card session, a bank
-- deposit or a payment recorded by hand), are caught where every path meets:
-- sync_spin_wheel_order_entitlements, which runs when an order's derived
-- payment_status changes.
--
--   * When a spin order becomes paid for a wheel that has ended (status
--     'ended' or its close time has passed), the order is flagged in
--     orders.needs_review_reason so the committee sees "refund required" on
--     the Orders screen. Spins are still recorded, but they cannot be used.
--   * The cron only emails a guest link while the order is still paid.
--   * spin_wheel_close_impact() counts in-progress card checkouts from the
--     payment ledger (pending Stripe attempts inside the checkout window)
--     rather than from the order's age, plus unused paid spins.
--
-- Rollback:
--   begin;
--   drop function public.spin_wheel_close_impact(uuid);
--   -- then re-run the sync_spin_wheel_order_entitlements definition from
--   -- 20260928100000_spin_the_wheel.sql and the
--   -- spin_wheel_orders_needing_work definition from
--   -- 20260928120000_spin_the_wheel_cron_work.sql
--   commit;
begin;
set local lock_timeout = '3s';

create or replace function public.sync_spin_wheel_order_entitlements(target_order uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  link public.spin_wheel_orders%rowtype;
  v_payment_status text;
  v_deleted timestamptz;
  v_wheel public.spin_wheels%rowtype;
  added integer := 0;
begin
  select * into link from public.spin_wheel_orders where order_id = target_order for update;
  if not found then return 0; end if;
  select o.payment_status, o.deleted_at into v_payment_status, v_deleted
    from public.orders o where o.id = target_order;
  if v_payment_status = 'paid' and v_deleted is null then
    insert into public.spin_wheel_entitlements (wheel_id, auth_user_id, pass_id, source, spin_order_id, seq)
      select link.wheel_id, link.auth_user_id, link.pass_id, 'purchase', link.id, slot
      from generate_series(1, link.quantity) as slot
      on conflict (spin_order_id, seq) where spin_order_id is not null do nothing;
    get diagnostics added = row_count;
    update public.spin_wheel_entitlements set revoked_at = null
      where spin_order_id = link.id and used_at is null and revoked_at is not null;
    update public.spin_wheel_orders set paid_at = coalesce(paid_at, now()) where id = link.id;
    -- Paid after the wheel closed: the spins can never be used. Ask for a refund.
    select * into v_wheel from public.spin_wheels where id = link.wheel_id;
    if v_wheel.status = 'ended' or (v_wheel.ends_at is not null and v_wheel.ends_at <= now()) then
      update public.orders
        set needs_review_reason = 'Spin the Wheel closed before this payment settled; the spins cannot be used. Refund the buyer.'
        where id = target_order and coalesce(needs_review_reason, '') = '';
    end if;
  else
    update public.spin_wheel_entitlements set revoked_at = now()
      where spin_order_id = link.id and used_at is null and revoked_at is null;
  end if;
  return added;
end $$;
revoke all on function public.sync_spin_wheel_order_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.sync_spin_wheel_order_entitlements(uuid) to service_role;

create or replace function public.spin_wheel_orders_needing_work(since timestamptz, max_rows integer, skip_ids uuid[] default '{}')
returns table (id uuid, order_id uuid, pass_id uuid)
language sql stable security definer set search_path = '' as $$
  select so.id, so.order_id, so.pass_id
  from public.spin_wheel_orders so
  join public.orders o on o.id = so.order_id
  where so.created_at >= since
    and not (so.id = any(coalesce(skip_ids, '{}')))
    and (
      (o.payment_status = 'paid' and o.deleted_at is null and (
        so.paid_at is null
        or (select count(*) from public.spin_wheel_entitlements e where e.spin_order_id = so.id) < so.quantity
        or exists (select 1 from public.spin_wheel_entitlements e
                   where e.spin_order_id = so.id and e.used_at is null and e.revoked_at is not null)))
      or ((o.payment_status is distinct from 'paid' or o.deleted_at is not null)
        and exists (select 1 from public.spin_wheel_entitlements e
                    where e.spin_order_id = so.id and e.used_at is null and e.revoked_at is null))
      or (so.pass_id is not null and so.paid_at is not null and so.pass_emailed_at is null
        and o.payment_status = 'paid' and o.deleted_at is null)
    )
  order by so.created_at, so.id
  limit greatest(least(max_rows, 1000), 1);
$$;
revoke all on function public.spin_wheel_orders_needing_work(timestamptz, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.spin_wheel_orders_needing_work(timestamptz, integer, uuid[]) to service_role;

-- Card checkouts last 60 minutes, plus a 5 minute grace for an unlinked
-- session (app/api/payments/checkout-session): 65 minutes covers every
-- attempt that could still be paid.
create function public.spin_wheel_close_impact(target_wheel uuid)
returns table (active_checkouts integer, unused_paid_spins integer)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::integer from public.order_payments p
      join public.spin_wheel_orders so on so.order_id = p.order_id
      where so.wheel_id = target_wheel and p.provider = 'stripe' and p.status = 'pending'
        and p.created_at > now() - interval '65 minutes'),
    (select count(*)::integer from public.spin_wheel_entitlements e
      where e.wheel_id = target_wheel and e.source = 'purchase' and e.used_at is null and e.revoked_at is null);
$$;
revoke all on function public.spin_wheel_close_impact(uuid) from public, anon, authenticated;
grant execute on function public.spin_wheel_close_impact(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
