-- Deleting an order releases its unpaid event registration's place, and
-- restoring the order puts the registration back. Paid registrations are
-- never touched: deleting an order does not cancel or refund a payment.
--
-- Rollback:
--   restore public.set_order_deleted from 20260917232650_dino_admin_lifecycle.sql;
--   update public.event_registrations set payment_status = status_before_order_delete
--     where status_before_order_delete is not null and payment_status = 'cancelled';
--   alter table public.event_registrations drop column if exists status_before_order_delete;

alter table public.event_registrations add column if not exists status_before_order_delete text;
comment on column public.event_registrations.status_before_order_delete is
  'Payment status held before the linked order was deleted. Restoring the order puts it back.';

create or replace function public.set_order_deleted(p_id uuid, p_resource text, p_deleted boolean, p_actor uuid, p_confirmation text)
returns uuid language plpgsql set search_path='' as $$
declare changed uuid; linked uuid;
begin
  if not exists(select 1 from public.committee_users where id=p_actor and role='admin' and is_active) then
    raise exception 'Admin access required.';
  end if;
  if p_deleted and p_confirmation is distinct from 'DELETE ORDER' then raise exception 'Type DELETE ORDER to confirm.'; end if;
  if p_resource='orders' then
    update public.orders set deleted_at=case when p_deleted then now() end,deleted_by=case when p_deleted then p_actor end
      where id=p_id returning id into changed;
    update public.kitchen_orders set deleted_at=case when p_deleted then now() end,deleted_by=case when p_deleted then p_actor end where linked_order_id=p_id;
  elsif p_resource='kitchenOrders' then
    update public.kitchen_orders set deleted_at=case when p_deleted then now() end,deleted_by=case when p_deleted then p_actor end
      where id=p_id returning id,linked_order_id into changed,linked;
    update public.orders set deleted_at=case when p_deleted then now() end,deleted_by=case when p_deleted then p_actor end where id=linked;
  else raise exception 'Unknown order resource.'; end if;
  if changed is null then raise exception 'Order not found.'; end if;
  if p_resource='orders' then
    if p_deleted then
      update public.event_registrations set status_before_order_delete=payment_status, payment_status='cancelled'
        where order_id=p_id and status_before_order_delete is null
          and coalesce(payment_status,'') not in ('paid','not_required','cancelled','failed','refunded','expired');
    else
      -- A registration paid while its order was deleted keeps its paid status.
      update public.event_registrations
        set payment_status=case when payment_status='cancelled' then status_before_order_delete else payment_status end,
            status_before_order_delete=null
        where order_id=p_id and status_before_order_delete is not null;
    end if;
  end if;
  return changed;
end; $$;

revoke all on function public.set_order_deleted(uuid,text,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.set_order_deleted(uuid,text,boolean,uuid,text) to service_role;

-- Registrations whose orders were deleted before this change.
update public.event_registrations r
  set status_before_order_delete=r.payment_status, payment_status='cancelled'
  from public.orders o
  where o.id=r.order_id and o.deleted_at is not null and r.status_before_order_delete is null
    and coalesce(r.payment_status,'') not in ('paid','not_required','cancelled','failed','refunded','expired');
