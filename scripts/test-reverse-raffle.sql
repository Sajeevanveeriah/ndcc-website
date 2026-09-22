-- Runs only in the disposable migration-replay database.
begin;
do $$
declare campaign uuid; purchase uuid; refs text[]; counter_before integer; row_data record;
begin
  select id into strict campaign from public.raffle_campaigns where code='NDCCRRO';
  if not exists(select 1 from public.raffle_campaigns where id=campaign and price_cents=6000 and next_ticket_number=201 and not active and public_visibility_mode='hidden') then
    raise exception 'Reverse raffle must start hidden at $60 and 201';
  end if;
  insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference)
    values(campaign,'Test purchaser','test@example.com',2,12000,public.allocate_payment_reference('raffle',now())) returning id into purchase;
  if exists(select 1 from public.raffle_tickets where raffle_order_id=purchase) then raise exception 'Unpaid tickets allocated'; end if;
  perform * from public.issue_paid_raffle_tickets(purchase,'evt_reverse_test','cs_reverse_test','pi_reverse_test');
  select array_agg(ticket_reference order by ticket_number) into refs from public.raffle_tickets where raffle_order_id=purchase;
  if refs is distinct from array['NDCCRRO-20260201','NDCCRRO-20260202'] then raise exception 'Incorrect first ticket sequence: %',refs; end if;
  perform * from public.issue_paid_raffle_tickets(purchase,'evt_reverse_test','cs_reverse_test','pi_reverse_test');
  perform * from public.issue_paid_raffle_tickets(purchase,'evt_reverse_test_replay','cs_reverse_test','pi_reverse_test');
  if (select count(*) from public.raffle_tickets where raffle_order_id=purchase)<>2
    or (select next_ticket_number from public.raffle_campaigns where id=campaign)<>203 then raise exception 'Replay allocated new tickets'; end if;
  for counter_before in 1..5 loop
    insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference)
    values(campaign,'Capacity test','test@example.com',case when counter_before=5 then 18 else 20 end,case when counter_before=5 then 108000 else 120000 end,public.allocate_payment_reference('raffle',now()));
  end loop;
  begin
    insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents) values(campaign,'Over capacity','test@example.com',1,6000);
    raise exception 'Capacity guard allowed overselling';
  exception when raise_exception then
    if sqlerrm <> 'Reverse raffle allocation unavailable' then raise; end if;
  end;
  for row_data in select id from public.raffle_orders where campaign_id=campaign and status='pending_payment' loop
    perform * from public.issue_paid_raffle_tickets(row_data.id,'evt_'||row_data.id,'cs_'||row_data.id,'pi_'||row_data.id);
  end loop;
  if (select count(*) from public.raffle_tickets where campaign_id=campaign)<>100 or
    (select max(ticket_number) from public.raffle_tickets where campaign_id=campaign)<>300 or
    (select next_ticket_number from public.raffle_campaigns where id=campaign)<>301 then raise exception 'Incorrect sold-out boundary'; end if;
  begin
    update public.raffle_orders set status='pending_payment' where id=purchase;
    raise exception 'Paid order returned to pending';
  exception when raise_exception then
    if sqlerrm <> 'Reverse raffle orders cannot return to pending payment; create a new checkout.' then raise; end if;
  end;
  update public.raffle_orders set status='cancelled' where id=purchase;
  begin
    update public.raffle_orders set status='pending_payment' where id=purchase;
    raise exception 'Cancelled order returned to pending';
  exception when raise_exception then
    if sqlerrm <> 'Reverse raffle orders cannot return to pending payment; create a new checkout.' then raise; end if;
  end;
  if (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.legacy_payment_receipt_references'::regclass and conname='legacy_payment_receipt_references_canonical_reference_check') not like '%NCDDKIT%' then raise exception 'Legacy kitchen spelling rejected'; end if;
  if has_table_privilege('anon','public.legacy_payment_receipt_references','SELECT')
    or has_table_privilege('authenticated','public.legacy_payment_receipt_references','INSERT')
    or has_function_privilege('anon','public.payment_receipt_reference(uuid)','EXECUTE') then raise exception 'Legacy receipt mappings exposed'; end if;
end $$;
rollback;

-- Selected-number reservations, release, exact settlement and legacy rollout.
begin;
do $$ declare campaign uuid; first_order uuid; second_order uuid; cancelled_order uuid; numbers integer[]; begin
  select id into strict campaign from public.raffle_campaigns where code='NDCCRRO';
  insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,selected_ticket_numbers)
    values(campaign,'Chosen numbers','test@example.com',2,12000,array[201,300]) returning id into first_order;
  select array_agg(ticket_number order by ticket_number) into numbers from public.reverse_raffle_unavailable_numbers();
  if numbers is distinct from array[201,300] then raise exception 'Selected numbers were not reserved'; end if;
  begin
    insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,selected_ticket_numbers)
      values(campaign,'Collision','test@example.com',1,6000,array[300]);
    raise exception 'Duplicate reservation accepted';
  exception when raise_exception then if sqlerrm <> 'Reverse raffle number unavailable' then raise; end if; end;
  begin
    insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,selected_ticket_numbers)
      values(campaign,'Invalid duplicate','test@example.com',2,12000,array[250,250]);
    raise exception 'Duplicate selection accepted';
  exception when raise_exception then if sqlerrm <> 'Invalid reverse raffle number selection' then raise; end if; end;
  begin
    update public.raffle_orders set selected_ticket_numbers=array[202,299] where id=first_order;
    raise exception 'Reservation changed';
  exception when raise_exception then if sqlerrm <> 'Reverse raffle number reservations cannot be changed' then raise; end if; end;
  insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents)
    values(campaign,'Older client','test@example.com',1,6000) returning id into second_order;
  if (select selected_ticket_numbers from public.raffle_orders where id=second_order) is distinct from array[202] then raise exception 'Legacy client collided with chosen numbers'; end if;
  perform * from public.issue_paid_raffle_tickets(second_order,'evt_choice_second','cs_choice_second','pi_choice_second');
  perform * from public.issue_paid_raffle_tickets(first_order,'evt_choice_first','cs_choice_first','pi_choice_first');
  perform * from public.issue_paid_raffle_tickets(first_order,'evt_choice_first','cs_choice_first','pi_choice_first');
  select array_agg(ticket_number order by ticket_number) into numbers from public.raffle_tickets where raffle_order_id=first_order;
  if numbers is distinct from array[201,300] then raise exception 'Payment issued different or duplicate numbers'; end if;
  insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,selected_ticket_numbers)
    values(campaign,'Cancelled checkout','test@example.com',1,6000,array[250]) returning id into cancelled_order;
  update public.raffle_orders set status='cancelled' where id=cancelled_order;
  if exists(select 1 from public.reverse_raffle_unavailable_numbers() where ticket_number=250) then raise exception 'Cancelled number was not released'; end if;
  insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,selected_ticket_numbers)
    values(campaign,'Reuse released number','test@example.com',1,6000,array[250]);
  begin
    perform * from public.issue_paid_raffle_tickets(cancelled_order,'evt_cancelled_choice','cs_cancelled_choice','pi_cancelled_choice');
    raise exception 'Cancelled reservation issued a ticket';
  exception when raise_exception then if sqlerrm <> 'Reverse raffle order has no active number reservation' then raise; end if; end;
  if has_function_privilege('anon','public.reverse_raffle_unavailable_numbers()','EXECUTE')
    or has_function_privilege('authenticated','public.reverse_raffle_unavailable_numbers()','EXECUTE') then raise exception 'Number RPC exposed directly'; end if;
end $$;
rollback;
