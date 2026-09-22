-- Anchor recurring reminders to successful delivery, preserving the outbox history.
create or replace function public.claim_apparel_balance_reminder()
returns setof public.apparel_balance_reminders
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.apparel_balance_links(order_id)
    select id from public.orders where order_category='merch' and payment_status in ('part_paid','unpaid','pending','pending_bank_transfer')
      and balance_due>0 and deleted_at is null and order_status<>'cancelled'
    on conflict(order_id) do nothing;
  -- The next reminder is due 21 days after the last successful send.
  -- Orders without any reminder retain their first due date 21 days after ordering.
  insert into public.apparel_balance_reminders(order_id,cycle,due_at)
    select o.id, coalesce(history.last_cycle,0)+1,
      coalesce(history.last_sent,o.created_at)+interval '21 days'
    from public.orders o
    cross join lateral (
      select max(r.cycle) last_cycle, max(r.sent_at) filter(where r.status='sent') last_sent
      from public.apparel_balance_reminders r where r.order_id=o.id
    ) history
    where o.order_category='merch' and o.payment_status in ('part_paid','unpaid','pending','pending_bank_transfer')
      and o.balance_due>0 and o.deleted_at is null and o.order_status<>'cancelled'
      and coalesce(history.last_sent,o.created_at)<=now()-interval '21 days'
      and not exists(select 1 from public.apparel_balance_reminders r where r.order_id=o.id and r.status in ('queued','sending','needs_review'))
    on conflict(order_id,cycle) do nothing;
  update public.apparel_balance_reminders r set status='cancelled',lease_until=null
    from public.orders o where o.id=r.order_id and r.status in ('queued','sending')
      and (o.payment_status not in ('part_paid','unpaid','pending','pending_bank_transfer') or o.balance_due<=0 or o.deleted_at is not null or o.order_status='cancelled');
  -- Resend idempotency expires after 24h. Ambiguous older attempts need review,
  -- not an automatic resend that could charge the inbox twice.
  update public.apparel_balance_reminders set status='needs_review',last_error='Delivery confirmation required before retrying outside the provider idempotency window.'
    where status in ('queued','sending') and first_attempt_at < now()-interval '23 hours';
  select id into v_id from public.apparel_balance_reminders
    where status in ('queued','sending') and next_attempt_at<=now() and (lease_until is null or lease_until<now())
    order by due_at for update skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.apparel_balance_reminders set status='sending',lease_token=gen_random_uuid(),
    lease_until=now()+interval '5 minutes',first_attempt_at=coalesce(first_attempt_at,now())
    where id=v_id returning *;
end $$;
revoke all on function public.claim_apparel_balance_reminder() from public,anon,authenticated;
grant execute on function public.claim_apparel_balance_reminder() to service_role;


-- Authorised one-off initial reminder for all currently outstanding apparel orders.
-- Keep previous sent records; never overwrite an in-flight or ambiguous delivery.
insert into public.apparel_balance_reminders(order_id,cycle,due_at)
select o.id,coalesce((select max(r.cycle) from public.apparel_balance_reminders r where r.order_id=o.id),0)+1,now()
from public.orders o
where o.order_category='merch' and o.payment_status in ('part_paid','unpaid','pending','pending_bank_transfer')
  and o.balance_due>0 and o.deleted_at is null and o.order_status<>'cancelled'
  and not exists(select 1 from public.apparel_balance_reminders r where r.order_id=o.id and r.status='sent' and (r.sent_at at time zone 'Australia/Melbourne')::date=(now() at time zone 'Australia/Melbourne')::date)
  and not exists(select 1 from public.apparel_balance_reminders r where r.order_id=o.id and r.status in ('queued','sending','needs_review'))
on conflict(order_id,cycle) do nothing;
