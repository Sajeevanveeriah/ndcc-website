-- Runs only in the disposable migration-replay database.
begin;
do $$
declare campaign uuid; purchase uuid; refs text[]; counter_before integer;
begin
  select id into strict campaign from public.raffle_campaigns where code='NDCCRRO';
  if not exists(select 1 from public.raffle_campaigns where id=campaign and price_cents=6000 and next_ticket_number=0 and not active and public_visibility_mode='hidden') then
    raise exception 'Reverse raffle must start hidden at $60 and zero';
  end if;
  insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference)
    values(campaign,'Test purchaser','test@example.com',2,12000,public.allocate_payment_reference('raffle',now())) returning id into purchase;
  if exists(select 1 from public.raffle_tickets where raffle_order_id=purchase) then raise exception 'Unpaid tickets allocated'; end if;
  perform * from public.issue_paid_raffle_tickets(purchase,'evt_reverse_test','cs_reverse_test','pi_reverse_test');
  select array_agg(ticket_reference order by ticket_number) into refs from public.raffle_tickets where raffle_order_id=purchase;
  if refs is distinct from array['NDCCRRO-20260000','NDCCRRO-20260001'] then raise exception 'Incorrect first ticket sequence: %',refs; end if;
  perform * from public.issue_paid_raffle_tickets(purchase,'evt_reverse_test','cs_reverse_test','pi_reverse_test');
  perform * from public.issue_paid_raffle_tickets(purchase,'evt_reverse_test_replay','cs_reverse_test','pi_reverse_test');
  if (select count(*) from public.raffle_tickets where raffle_order_id=purchase)<>2
    or (select next_ticket_number from public.raffle_campaigns where id=campaign)<>2 then raise exception 'Replay allocated new tickets'; end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.legacy_payment_receipt_references'::regclass and conname='legacy_payment_receipt_references_canonical_reference_check') not like '%NCDDKIT%' then raise exception 'Legacy kitchen spelling rejected'; end if;
  if has_table_privilege('anon','public.legacy_payment_receipt_references','SELECT')
    or has_table_privilege('authenticated','public.legacy_payment_receipt_references','INSERT')
    or has_function_privilege('anon','public.payment_receipt_reference(uuid)','EXECUTE') then raise exception 'Legacy receipt mappings exposed'; end if;
end $$;
rollback;
