begin;
-- Block checkout/settlement while assigning numbers to existing pending orders.
lock table public.raffle_campaigns, public.raffle_orders, public.raffle_tickets in access exclusive mode;
alter table public.raffle_orders add column selected_ticket_numbers integer[];

create function public.reverse_raffle_unavailable_numbers()
returns table(ticket_number integer) language sql stable security definer set search_path='' as $$
  select t.ticket_number from public.raffle_tickets t
    join public.raffle_campaigns c on c.id=t.campaign_id where c.code='NDCCRRO'
  union
  select unnest(o.selected_ticket_numbers) from public.raffle_orders o
    join public.raffle_campaigns c on c.id=o.campaign_id
    where c.code='NDCCRRO' and o.status='pending_payment';
$$;
revoke all on function public.reverse_raffle_unavailable_numbers() from public,anon,authenticated;
grant execute on function public.reverse_raffle_unavailable_numbers() to service_role;

-- Preserve paid ticket numbers. Pre-existing payable sessions receive fixed
-- reservations so they cannot collide with a purchaser's new selection.
update public.raffle_orders o set selected_ticket_numbers=(
  select array_agg(t.ticket_number order by t.ticket_number) from public.raffle_tickets t where t.raffle_order_id=o.id
) where exists(select 1 from public.raffle_campaigns c where c.id=o.campaign_id and c.code='NDCCRRO')
  and exists(select 1 from public.raffle_tickets t where t.raffle_order_id=o.id);
do $$ declare o record; numbers integer[]; begin
  for o in select r.id,r.quantity from public.raffle_orders r
    join public.raffle_campaigns c on c.id=r.campaign_id
    where c.code='NDCCRRO' and r.status='pending_payment' and r.selected_ticket_numbers is null
    order by r.created_at,r.id loop
    select array_agg(n order by n) into numbers from (
      select n from generate_series(201,300) n
      where not exists(select 1 from public.reverse_raffle_unavailable_numbers() u where u.ticket_number=n)
      order by n limit o.quantity
    ) available;
    if cardinality(numbers) is distinct from o.quantity then raise exception 'Existing reverse raffle reservations exceed available numbers'; end if;
    update public.raffle_orders set selected_ticket_numbers=numbers where id=o.id;
  end loop;
end $$;

create or replace function public.reserve_reverse_raffle_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.raffle_campaigns%rowtype;
begin
  select * into strict c from public.raffle_campaigns where id=new.campaign_id for update;
  if c.code <> 'NDCCRRO' then return new; end if;
  if new.status <> 'pending_payment' or new.amount_cents <> new.quantity*6000 or new.currency <> 'aud' then
    raise exception 'Invalid reverse raffle checkout.';
  end if;
  -- Older deployed clients retain automatic allocation during rollout.
  if new.selected_ticket_numbers is null then
    select array_agg(n order by n) into new.selected_ticket_numbers from (
      select n from generate_series(201,300) n
      where not exists(select 1 from public.reverse_raffle_unavailable_numbers() u where u.ticket_number=n)
      order by n limit new.quantity
    ) available;
    if cardinality(new.selected_ticket_numbers) is distinct from new.quantity then raise exception 'Reverse raffle allocation unavailable'; end if;
  end if;
  if cardinality(new.selected_ticket_numbers) is distinct from new.quantity
    or array_ndims(new.selected_ticket_numbers) is distinct from 1
    or exists(select 1 from unnest(new.selected_ticket_numbers) n where n is null or n not between 201 and 300)
    or (select count(distinct n) from unnest(new.selected_ticket_numbers) n) <> new.quantity then
    raise exception 'Invalid reverse raffle number selection';
  end if;
  if exists(select 1 from public.reverse_raffle_unavailable_numbers() u where u.ticket_number=any(new.selected_ticket_numbers)) then
    raise exception 'Reverse raffle number unavailable';
  end if;
  return new;
end $$;

create function public.guard_reverse_raffle_selection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.raffle_campaigns where id in (old.campaign_id,new.campaign_id) and code='NDCCRRO')
    and (new.campaign_id is distinct from old.campaign_id
      or new.quantity is distinct from old.quantity
      or new.selected_ticket_numbers is distinct from old.selected_ticket_numbers) then
    raise exception 'Reverse raffle number reservations cannot be changed';
  end if;
  return new;
end $$;
revoke all on function public.guard_reverse_raffle_selection() from public,anon,authenticated;
create trigger guard_reverse_raffle_selection before update of campaign_id,quantity,selected_ticket_numbers
  on public.raffle_orders for each row execute function public.guard_reverse_raffle_selection();

CREATE OR REPLACE FUNCTION public.issue_paid_raffle_tickets(target_order_id uuid, target_provider_event_id text, target_session_id text, target_payment_intent_id text)
 RETURNS TABLE(ticket_reference text, duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if campaign.code <> 'NDCCRRO' and campaign.next_ticket_number + target_order.quantity - 1 > 9999 then
    raise exception 'Raffle ticket allocation exhausted';
  end if;
  if target_order.status = 'paid' then
    raise exception 'Paid raffle order has no allocated tickets.'
      using errcode = 'integrity_constraint_violation';
  end if;

  if campaign.code = 'NDCCRRO' then
    if target_order.status <> 'pending_payment'
      or cardinality(target_order.selected_ticket_numbers) is distinct from target_order.quantity then
      raise exception 'Reverse raffle order has no active number reservation';
    end if;
    foreach start_number in array target_order.selected_ticket_numbers loop
      insert into public.raffle_tickets(raffle_order_id,campaign_id,ticket_number,ticket_reference)
      values(target_order.id,campaign.id,start_number,
        campaign.code || '-' || campaign.year_code || lpad(start_number::text,4,'0'));
    end loop;
    -- Compatibility counter is the first unissued number, not a sales count.
    update public.raffle_campaigns set next_ticket_number = coalesce((
      select min(n) from generate_series(201,300) n
      where not exists(select 1 from public.raffle_tickets t where t.campaign_id=campaign.id and t.ticket_number=n)
    ),301), updated_at=pg_catalog.now() where id=campaign.id;
  else
    start_number := campaign.next_ticket_number;
    for counter in 0..target_order.quantity - 1 loop
      insert into public.raffle_tickets(raffle_order_id,campaign_id,ticket_number,ticket_reference)
      values(target_order.id,campaign.id,start_number+counter,
        campaign.code || '-' || campaign.year_code || lpad((start_number+counter)::text,4,'0'));
    end loop;
    update public.raffle_campaigns set next_ticket_number=start_number+target_order.quantity,
      updated_at=pg_catalog.now() where id=campaign.id;
  end if;
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
$function$;

notify pgrst,'reload schema';
commit;
