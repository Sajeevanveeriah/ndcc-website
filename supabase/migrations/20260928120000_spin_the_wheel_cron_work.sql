-- Spin the Wheel follow-up (review on #278): the daily cron asks only for
-- spin orders that still need work, so finished orders drop out and a large
-- backlog can never hide newer problems behind the time budget.
--
-- An order needs work when:
--   * it is paid but its spins are missing, revoked or paid_at is unset;
--   * it is no longer paid (refund, dispute, deleted) but still has open spins;
--   * it is a paid guest order whose spin link has not been emailed.
--
-- Rollback:
--   begin;
--   drop function public.spin_wheel_orders_needing_work(timestamptz, integer, uuid[]);
--   commit;
begin;
set local lock_timeout = '3s';

create function public.spin_wheel_orders_needing_work(since timestamptz, max_rows integer, skip_ids uuid[] default '{}')
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
      or (so.pass_id is not null and so.paid_at is not null and so.pass_emailed_at is null)
    )
  order by so.created_at, so.id
  limit greatest(least(max_rows, 1000), 1);
$$;
revoke all on function public.spin_wheel_orders_needing_work(timestamptz, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.spin_wheel_orders_needing_work(timestamptz, integer, uuid[]) to service_role;

notify pgrst, 'reload schema';
commit;
