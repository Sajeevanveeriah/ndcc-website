-- Bank deposit hardening after 20260926022450_bank_transfer_selection.
--
-- 1. Unconfirmed reverse raffle bank-deposit holds expire after 48 hours
--    (reverse_raffle_bank_hold_interval). Expired holds stop counting as
--    unavailable numbers, so reserve_reverse_raffle_capacity (which reads
--    reverse_raffle_unavailable_numbers) lets other buyers choose them.
--    Card (Stripe) holds are unchanged: they last until Stripe expiry.
-- 2. confirm_special_bank_transfer refuses to issue reverse raffle tickets
--    when an expired hold's numbers were sold or are held by another active
--    checkout, so a late deposit can never create duplicate numbers.
-- 3. Optional per-product bank deposit switches. NULL inherits the existing
--    merch_payment_settings.bank_transfer_enabled, so behaviour is unchanged.
-- 4. Audited admin-only switch of an unconfirmed Dino bank selection back to
--    card payment.
--
-- Rollback (restores the previous behaviour; no data is lost):
--   begin;
--   -- Re-run the create or replace function public.reverse_raffle_unavailable_numbers()
--   -- body from 20260922231000_reverse_raffle_number_selection.sql, then the
--   -- create function public.confirm_special_bank_transfer(...) body from
--   -- 20260926022450_bank_transfer_selection.sql as "create or replace".
--   drop function if exists public.switch_dino_bank_transfer_to_card(uuid,uuid);
--   drop function if exists public.reverse_raffle_order_holds_numbers(public.raffle_orders);
--   drop function if exists public.reverse_raffle_bank_hold_interval();
--   alter table public.merch_payment_settings
--     drop column if exists raffle_bank_transfer_enabled,
--     drop column if exists reverse_raffle_bank_transfer_enabled,
--     drop column if exists dino_bank_transfer_enabled,
--     drop column if exists donation_bank_transfer_enabled;
--   notify pgrst, 'reload schema';
--   commit;
begin;
set local lock_timeout = '3s';

-- Named constant shared with lib/payments/bank-transfer.ts (BANK_TRANSFER_HOLD_HOURS).
create function public.reverse_raffle_bank_hold_interval()
returns interval language sql immutable set search_path='' as $$
  select interval '48 hours'
$$;
revoke all on function public.reverse_raffle_bank_hold_interval() from public,anon,authenticated;
grant execute on function public.reverse_raffle_bank_hold_interval() to service_role;

-- True while a pending order still reserves its selected numbers.
create function public.reverse_raffle_order_holds_numbers(source public.raffle_orders)
returns boolean language sql stable set search_path='' as $$
  select source.status = 'pending_payment' and not coalesce(
    source.payment_method = 'bank_transfer'
    and source.bank_transfer_confirmed_at is null
    and source.bank_transfer_selected_at < pg_catalog.now() - public.reverse_raffle_bank_hold_interval(),
    false)
$$;
revoke all on function public.reverse_raffle_order_holds_numbers(public.raffle_orders) from public,anon,authenticated;
grant execute on function public.reverse_raffle_order_holds_numbers(public.raffle_orders) to service_role;

create or replace function public.reverse_raffle_unavailable_numbers()
returns table(ticket_number integer) language sql stable security definer set search_path='' as $$
  select t.ticket_number from public.raffle_tickets t
    join public.raffle_campaigns c on c.id=t.campaign_id where c.code='NDCCRRO'
  union
  select unnest(o.selected_ticket_numbers) from public.raffle_orders o
    join public.raffle_campaigns c on c.id=o.campaign_id
    where c.code='NDCCRRO' and public.reverse_raffle_order_holds_numbers(o);
$$;
revoke all on function public.reverse_raffle_unavailable_numbers() from public,anon,authenticated;
grant execute on function public.reverse_raffle_unavailable_numbers() to service_role;

-- Unchanged from 20260926022450 except the reverse raffle number check.
create or replace function public.confirm_special_bank_transfer(target_kind text,target_id uuid,actor_id uuid,expected_cents integer,bank_reference text)
returns boolean language plpgsql security definer set search_path='' as $$
declare o public.raffle_orders%rowtype; e public.fantasy_entries%rowtype; c public.raffle_campaigns%rowtype; n integer;
begin
 if not exists(select 1 from public.committee_users where id=actor_id and is_active and role='admin') then raise exception 'Administrator required'; end if;
 if length(trim(coalesce(bank_reference,''))) not between 3 and 200 or expected_cents is null or expected_cents<=0 then raise exception 'Amount and bank transaction reference required'; end if;
 if target_kind='raffle' then
  select * into strict o from public.raffle_orders where id=target_id for update;
  if o.amount_cents<>expected_cents then raise exception 'Amount changed'; end if;
  if o.status='paid' and o.bank_transfer_confirmed_at is not null then return false; end if;
  if o.status<>'pending_payment' or o.payment_method<>'bank_transfer' or o.stripe_checkout_session_id is not null or o.stripe_payment_intent_id is not null then raise exception 'Order is not awaiting bank payment'; end if;
  -- The campaign row lock serialises with checkout reservations and Stripe settlement.
  select * into strict c from public.raffle_campaigns where id=o.campaign_id for update;
  if exists(select 1 from public.raffle_tickets where raffle_order_id=o.id) then raise exception 'Ticket allocation already exists'; end if;
  if c.code='NDCCRRO' then
   if cardinality(o.selected_ticket_numbers) is distinct from o.quantity then raise exception 'Number reservation missing'; end if;
   if exists(select 1 from public.raffle_tickets t where t.campaign_id=c.id and t.ticket_number=any(o.selected_ticket_numbers))
    or exists(select 1 from public.raffle_orders other where other.campaign_id=c.id and other.id<>o.id
      and other.selected_ticket_numbers && o.selected_ticket_numbers
      and public.reverse_raffle_order_holds_numbers(other)) then
    raise exception 'Reverse raffle numbers no longer available: the bank deposit hold expired and one or more numbers were sold or are held by another checkout';
   end if;
   foreach n in array o.selected_ticket_numbers loop
    insert into public.raffle_tickets(raffle_order_id,campaign_id,ticket_number,ticket_reference) values(o.id,c.id,n,c.code||'-'||c.year_code||lpad(n::text,4,'0'));
   end loop;
   update public.raffle_campaigns set next_ticket_number=coalesce((select min(v) from generate_series(201,300) v where not exists(select 1 from public.raffle_tickets t where t.campaign_id=c.id and t.ticket_number=v)),301),updated_at=now() where id=c.id;
  else
   if c.next_ticket_number+o.quantity-1>9999 then raise exception 'Ticket allocation exhausted'; end if;
   for n in c.next_ticket_number..c.next_ticket_number+o.quantity-1 loop
    insert into public.raffle_tickets(raffle_order_id,campaign_id,ticket_number,ticket_reference) values(o.id,c.id,n,c.code||'-'||c.year_code||lpad(n::text,4,'0'));
   end loop;
   update public.raffle_campaigns set next_ticket_number=c.next_ticket_number+o.quantity,updated_at=now() where id=c.id;
  end if;
  update public.raffle_orders set bank_transfer_confirmed_at=now(),bank_transfer_confirmed_by=actor_id,bank_transfer_reference=trim(bank_reference),status='paid',paid_at=now(),updated_at=now() where id=o.id;
 elsif target_kind='dino' then
  select * into strict e from public.fantasy_entries where id=target_id for update;
  if e.entry_fee_cents<>expected_cents then raise exception 'Amount changed'; end if;
  if e.status='paid' and e.bank_transfer_confirmed_at is not null then return false; end if;
  if e.bank_transfer_selected_at is null or e.status not in ('payment_required','pending','failed','expired') or e.is_demo or e.fee_waived or e.stripe_checkout_session_id is not null or e.stripe_payment_intent_id is not null then raise exception 'Entry is not awaiting bank payment'; end if;
  update public.fantasy_entries set bank_transfer_confirmed_at=now(),bank_transfer_confirmed_by=actor_id,bank_transfer_reference=trim(bank_reference),status='paid',paid_at=now(),updated_at=now() where id=e.id;
 else raise exception 'Unsupported payment type'; end if;
 return true;
end $$;
revoke all on function public.confirm_special_bank_transfer(text,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.confirm_special_bank_transfer(text,uuid,uuid,integer,text) to service_role;

-- NULL inherits bank_transfer_enabled; true/false overrides it per product.
alter table public.merch_payment_settings
  add column raffle_bank_transfer_enabled boolean,
  add column reverse_raffle_bank_transfer_enabled boolean,
  add column dino_bank_transfer_enabled boolean,
  add column donation_bank_transfer_enabled boolean;
comment on column public.merch_payment_settings.raffle_bank_transfer_enabled is 'Trailer raffle bank deposit override; NULL inherits bank_transfer_enabled.';
comment on column public.merch_payment_settings.reverse_raffle_bank_transfer_enabled is 'Reverse raffle bank deposit override; NULL inherits bank_transfer_enabled.';
comment on column public.merch_payment_settings.dino_bank_transfer_enabled is 'Dino Coach bank deposit override; NULL inherits bank_transfer_enabled.';
comment on column public.merch_payment_settings.donation_bank_transfer_enabled is 'Donation bank deposit override; NULL inherits bank_transfer_enabled.';

-- Returns false (no change) for confirmed, paid or non-bank entries.
create function public.switch_dino_bank_transfer_to_card(target_entry_id uuid,actor_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare e public.fantasy_entries%rowtype;
begin
 if not exists(select 1 from public.committee_users where id=actor_id and is_active and role='admin') then raise exception 'Administrator required'; end if;
 select * into strict e from public.fantasy_entries where id=target_entry_id for update;
 if e.bank_transfer_selected_at is null or e.bank_transfer_confirmed_at is not null
  or e.status not in ('payment_required','pending','failed','expired')
  or e.stripe_payment_intent_id is not null or public.dino_has_payment_evidence(e) then
  return false;
 end if;
 update public.fantasy_entries set bank_transfer_selected_at=null,bank_transfer_reference=null,updated_at=now() where id=e.id;
 insert into public.fantasy_admin_events(manager_id,actor_id,action,reason,changes)
  values(e.manager_id,actor_id,'bank_transfer_switched_to_card','Administrator switched an unconfirmed bank deposit selection back to card payment',
   jsonb_build_object('entry_id',e.id,'payment_reference',e.payment_reference,'bank_transfer_selected_at',e.bank_transfer_selected_at));
 return true;
end $$;
revoke all on function public.switch_dino_bank_transfer_to_card(uuid,uuid) from public,anon,authenticated;
grant execute on function public.switch_dino_bank_transfer_to_card(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
