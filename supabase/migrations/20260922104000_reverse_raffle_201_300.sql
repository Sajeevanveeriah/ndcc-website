begin;
-- Numbering changes are safe only before any sale or checkout for this campaign.
do $$ declare c uuid; begin
 select id into strict c from public.raffle_campaigns where code='NDCCRRO' for update;
 if exists(select 1 from public.raffle_orders where campaign_id=c) or exists(select 1 from public.raffle_tickets where campaign_id=c) then
  raise exception 'Reverse raffle already has orders; reconcile before changing its range.';
 end if;
 update public.raffle_campaigns set next_ticket_number=201 where id=c;
end $$;
alter table public.raffle_campaigns add constraint reverse_raffle_number_range check(code <> 'NDCCRRO' or next_ticket_number between 201 and 301);

-- Serialize checkout reservations on the same campaign row used by settlement.
-- Pending orders retain their reservation until Stripe confirms expiry.
create function public.reserve_reverse_raffle_capacity() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.raffle_campaigns%rowtype; reserved integer;
begin
 select * into strict c from public.raffle_campaigns where id=new.campaign_id for update;
 if c.code <> 'NDCCRRO' then return new; end if;
 if new.status <> 'pending_payment' or new.amount_cents <> new.quantity*6000 or new.currency <> 'aud' then raise exception 'Invalid reverse raffle checkout.'; end if;
 select coalesce(sum(quantity),0) into reserved from public.raffle_orders where campaign_id=c.id and status='pending_payment';
 if c.next_ticket_number + reserved + new.quantity - 1 > 300 then raise exception 'Reverse raffle allocation unavailable'; end if;
 return new;
end $$;
revoke all on function public.reserve_reverse_raffle_capacity() from public,anon,authenticated;
create trigger reserve_reverse_raffle_capacity before insert on public.raffle_orders for each row execute function public.reserve_reverse_raffle_capacity();

create function public.guard_reverse_raffle_ticket_number() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.raffle_campaigns where id=new.campaign_id and code='NDCCRRO') and
 (new.ticket_number not between 201 and 300 or new.ticket_reference <> 'NDCCRRO-2026'||lpad(new.ticket_number::text,4,'0')) then
 raise exception 'Reverse raffle ticket number must be 201-300.';
 end if;
 return new;
end $$;
revoke all on function public.guard_reverse_raffle_ticket_number() from public,anon,authenticated;
create trigger guard_reverse_raffle_ticket_number before insert or update on public.raffle_tickets for each row execute function public.guard_reverse_raffle_ticket_number();

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
  if campaign.next_ticket_number + target_order.quantity - 1 > case when campaign.code = 'NDCCRRO' then 300 else 9999 end then
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
$function$;

notify pgrst,'reload schema';
commit;

