begin;
-- Purchaser intent is deliberately separate from settled payments and balances.
alter table public.orders add column bank_transfer_selected_at timestamptz;
comment on column public.orders.bank_transfer_selected_at is 'Purchaser selected bank deposit; not proof of receipt and never included in amount_paid.';
create index orders_bank_transfer_review_idx on public.orders(bank_transfer_selected_at)
  where bank_transfer_selected_at is not null and deleted_at is null;
alter table public.raffle_orders
  add column bank_transfer_selected_at timestamptz,
  add column bank_transfer_confirmed_at timestamptz,
  add column bank_transfer_confirmed_by uuid references public.committee_users(id),
  add column bank_transfer_reference text;
alter table public.fantasy_entries
  add column bank_transfer_selected_at timestamptz,
  add column bank_transfer_confirmed_at timestamptz,
  add column bank_transfer_confirmed_by uuid references public.committee_users(id),
  add column bank_transfer_reference text;
alter table public.raffle_orders drop constraint raffle_orders_payment_method_check;
alter table public.raffle_orders add constraint raffle_orders_payment_method_check check(payment_method in ('stripe','cash','bank_transfer'));
alter table public.raffle_orders drop constraint raffle_cash_evidence;
alter table public.raffle_orders add constraint raffle_cash_evidence check(
 (payment_method='stripe' and cash_received_by is null and cash_received_by_member is null and cash_received_at is null and cash_sale_key is null)
 or (payment_method='cash' and num_nonnulls(cash_received_by,cash_received_by_member)=1 and cash_received_at is not null and cash_sale_key is not null and stripe_payment_intent_id is null and stripe_checkout_session_id is null)
 or (payment_method='bank_transfer' and bank_transfer_selected_at is not null and cash_received_by is null and cash_received_by_member is null and cash_received_at is null and cash_sale_key is null and stripe_payment_intent_id is null and stripe_checkout_session_id is null));
create or replace function public.raffle_has_payment_evidence(source public.raffle_orders) returns boolean
language sql immutable set search_path='' as $$
 select coalesce((source.payment_method='stripe' and source.stripe_payment_intent_id ~ '^pi_')
 or (source.payment_method='cash' and num_nonnulls(source.cash_received_by,source.cash_received_by_member)=1 and source.cash_received_at is not null and source.cash_sale_key is not null and source.stripe_payment_intent_id is null and source.stripe_checkout_session_id is null)
 or (source.payment_method='bank_transfer' and source.bank_transfer_confirmed_at is not null and source.bank_transfer_confirmed_by is not null and length(trim(source.bank_transfer_reference))>=3 and source.stripe_payment_intent_id is null and source.stripe_checkout_session_id is null),false)
$$;
create function public.dino_has_payment_evidence(source public.fantasy_entries) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(source.stripe_payment_intent_id ~ '^pi_' or
 (source.bank_transfer_confirmed_at is not null and source.bank_transfer_confirmed_by is not null and length(trim(source.bank_transfer_reference))>=3 and source.stripe_payment_intent_id is null and source.stripe_checkout_session_id is null),false)
$$;
revoke all on function public.dino_has_payment_evidence(public.fantasy_entries) from public,anon,authenticated;
grant execute on function public.dino_has_payment_evidence(public.fantasy_entries) to service_role;
-- Preserve all existing receipt eligibility checks, replacing only the Dino
-- Stripe-only evidence predicate with verified Stripe OR audited bank receipt.
do $patch$
declare signature text; definition text; patched text;
begin
 foreach signature in array array[
  'public.enqueue_payment_receipt_job(text,uuid,timestamp with time zone)',
  'public.claim_payment_receipt_job(uuid,uuid,integer)',
  'public.preflight_payment_receipt_job(uuid,uuid)',
  'public.requeue_payment_receipt_job(uuid)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if signature like '%requeue_%' then
   patched:=regexp_replace(definition,
    'and stripe_payment_intent_id ~ ''\^pi_''(\s+and payment_reference ~ ''\^NDCCDCO-)',
    E'and public.dino_has_payment_evidence(fantasy_entries)\\1','g');
  else
   patched:=regexp_replace(definition,
    'source.stripe_payment_intent_id = source_payment_intent\s+and source_payment_intent ~ ''\^pi_''(\s+and source.payment_reference ~ ''\^NDCCDCO-)',
    E'public.dino_has_payment_evidence(source)\\1','g');
  end if;
  if patched=definition then raise exception 'Dino receipt predicate not found: %',signature; end if;
  execute patched;
 end loop;
end $patch$;
-- Full-payment-only confirmation for the two non-ledger payment domains.
-- A purchaser checkbox can never call this service-role-only function.
create function public.confirm_special_bank_transfer(target_kind text,target_id uuid,actor_id uuid,expected_cents integer,bank_reference text)
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
  select * into strict c from public.raffle_campaigns where id=o.campaign_id for update;
  if exists(select 1 from public.raffle_tickets where raffle_order_id=o.id) then raise exception 'Ticket allocation already exists'; end if;
  if c.code='NDCCRRO' then
   if cardinality(o.selected_ticket_numbers) is distinct from o.quantity then raise exception 'Number reservation missing'; end if;
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
notify pgrst, 'reload schema';
commit;
