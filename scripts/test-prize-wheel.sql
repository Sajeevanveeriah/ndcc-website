-- Disposable migration-replay database only. All fixtures roll back; no mail.
begin;
do $$
declare
  admin_id uuid; operator_id uuid; denied uuid; campaign uuid; second uuid; card_order uuid; held_order uuid;
  sale jsonb; replay jsonb; d public.raffle_draws%rowtype; d2 public.raffle_draws%rowtype; prize1 uuid; prize2 uuid;
  refs text[]; wheel_code text; jid uuid; worker uuid := gen_random_uuid(); claimed record;
begin
  insert into public.committee_users(email,full_name,password_hash,role) values(gen_random_uuid()||'@example.invalid','Wheel admin','test-only','admin') returning id into admin_id;
  insert into public.committee_users(email,full_name,password_hash,role,cms_permissions) values(gen_random_uuid()||'@example.invalid','Wheel operator','test-only','committee',array['raffle']) returning id into operator_id;
  insert into public.committee_users(email,full_name,password_hash,role) values(gen_random_uuid()||'@example.invalid','Wheel denied','test-only','committee') returning id into denied;

  -- 2x-6x rule: 20 numbers x $5 = $100 against $60 prizes is below 2x.
  begin
    perform public.save_wheel_campaign(jsonb_build_object('name','Wheel','price_cents',500,'wheel_divisions',20,
      'sales_open_at',now()-interval '1 hour','draw_at',now()+interval '2 hours','draw_label','Clubrooms','active',true,
      'prizes',jsonb_build_array(jsonb_build_object('name','Hamper','retail_value_cents',6000,'quantity',1))),admin_id);
    raise exception 'Below 2x accepted';
  exception when check_violation then null; end;
  -- 8 hour window.
  begin
    perform public.save_wheel_campaign(jsonb_build_object('name','Wheel','price_cents',500,'wheel_divisions',20,
      'sales_open_at',now()-interval '7 hours','draw_at',now()+interval '2 hours','draw_label','Clubrooms','active',true,
      'prizes',jsonb_build_array(jsonb_build_object('name','Hamper','retail_value_cents',3000,'quantity',1))),admin_id);
    raise exception 'Nine hour window accepted';
  exception when check_violation then null; end;
  -- $500 prize cap.
  begin
    perform public.save_wheel_campaign(jsonb_build_object('name','Wheel','price_cents',10000,'wheel_divisions',100,
      'sales_open_at',now()-interval '1 hour','draw_at',now()+interval '2 hours','draw_label','Clubrooms','active',true,
      'prizes',jsonb_build_array(jsonb_build_object('name','TV','retail_value_cents',50001,'quantity',1))),admin_id);
    raise exception 'Over $500 accepted';
  exception when check_violation then null; end;
  begin
    perform public.save_wheel_campaign(jsonb_build_object('name','Wheel','price_cents',500,'wheel_divisions',20,
      'sales_open_at',now()-interval '1 hour','draw_at',now()+interval '2 hours','draw_label','Clubrooms','active',true,
      'prizes',jsonb_build_array(jsonb_build_object('name','Hamper','retail_value_cents',3000))),operator_id);
    raise exception 'Non-admin campaign save accepted';
  exception when raise_exception then if sqlerrm = 'Non-admin campaign save accepted' then raise; end if; end;

  campaign := public.save_wheel_campaign(jsonb_build_object('name','Dinos Prize Wheel','price_cents',500,'wheel_divisions',24,
    'sales_open_at',now()-interval '1 hour','draw_at',now()+interval '2 hours','draw_label','Clubrooms','active',true,
    'public_visibility_mode','visible',
    'prizes',jsonb_build_array(jsonb_build_object('name','Meat tray','retail_value_cents',2500,'quantity',1),
      jsonb_build_object('name','Drinks voucher','retail_value_cents',1000,'quantity',2))),admin_id);
  select c.code into wheel_code from public.raffle_campaigns c where id = campaign;
  if wheel_code !~ '^NDCCWHL[0-9]{6}A$' or (select prize_pool_cents from public.raffle_campaigns where id = campaign) <> 4500 then
    raise exception 'Wheel code or prize pool incorrect: %', wheel_code;
  end if;
  select id into prize1 from public.raffle_wheel_prizes where campaign_id = campaign and position = 1;
  select id into prize2 from public.raffle_wheel_prizes where campaign_id = campaign and position = 2;

  -- $1,000 per day: $45 + $500 fits; another $460 on the same date does not.
  second := public.save_wheel_campaign(jsonb_build_object('name','Second wheel','price_cents',1000,'wheel_divisions',100,
    'sales_open_at',now()-interval '1 hour','draw_at',now()+interval '2 hours','draw_label','Clubrooms','active',true,
    'prizes',jsonb_build_array(jsonb_build_object('name','Bat','retail_value_cents',50000,'quantity',1))),admin_id);
  begin
    perform public.save_wheel_campaign(jsonb_build_object('name','Third wheel','price_cents',1000,'wheel_divisions',100,
      'sales_open_at',now()-interval '1 hour','draw_at',now()+interval '2 hours','draw_label','Clubrooms','active',true,
      'prizes',jsonb_build_array(jsonb_build_object('name','Cap','retail_value_cents',46000,'quantity',1))),admin_id);
    raise exception 'Daily cap exceeded';
  exception when raise_exception then if sqlerrm = 'Daily cap exceeded' then raise; end if; end;

  -- Deferred prize-pool checks pass for saved campaigns and reject a mismatch.
  set constraints all immediate;
  set constraints all deferred;
  begin
    insert into public.raffle_wheel_prizes(campaign_id,position,name,retail_value_cents) values(second,2,'Extra',100);
    set constraints all immediate;
    raise exception 'Prize pool mismatch accepted';
  exception when raise_exception then if sqlerrm = 'Prize pool mismatch accepted' then raise; end if; end;
  set constraints all deferred;

  -- Buyer-picked numbers, holds and bank-transfer refusal.
  insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,selected_ticket_numbers)
    values(campaign,'Card Buyer','card@example.invalid',2,1000,public.allocate_payment_reference('raffle'),array[7,3]) returning id into card_order;
  begin
    insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,selected_ticket_numbers)
      values(campaign,'Clash','clash@example.invalid',1,500,public.allocate_payment_reference('raffle'),array[7]);
    raise exception 'Held number resold';
  exception when raise_exception then if sqlerrm = 'Held number resold' then raise; end if; end;
  begin
    insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,selected_ticket_numbers)
      values(campaign,'Outside','outside@example.invalid',1,500,public.allocate_payment_reference('raffle'),array[25]);
    raise exception 'Number outside wheel accepted';
  exception when raise_exception then if sqlerrm = 'Number outside wheel accepted' then raise; end if; end;
  begin
    insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,selected_ticket_numbers,payment_method,bank_transfer_selected_at)
      values(campaign,'Bank','bank@example.invalid',1,500,public.allocate_payment_reference('raffle'),array[9],'bank_transfer',now());
    raise exception 'Bank transfer accepted';
  exception when raise_exception then if sqlerrm = 'Bank transfer accepted' then raise; end if; end;
  if (select array_agg(ticket_number order by ticket_number) from public.wheel_raffle_unavailable_numbers(campaign)) <> array[3,7] then
    raise exception 'Holds not reported';
  end if;
  perform * from public.issue_paid_raffle_tickets(card_order,'evt_wheel_card','cs_wheel_card','pi_wheel_card');
  select array_agg(ticket_reference order by ticket_number) into refs from public.raffle_tickets where raffle_order_id = card_order;
  if refs <> array['NDCCWHL-'||substr(wheel_code,8)||'-003','NDCCWHL-'||substr(wheel_code,8)||'-007'] then raise exception 'Wrong wheel ticket numbers: %', refs; end if;
  begin
    update public.raffle_campaigns set price_cents = 600 where id = campaign;
    raise exception 'Price changed after sale';
  exception when raise_exception then if sqlerrm = 'Price changed after sale' then raise; end if; end;
  begin
    update public.raffle_wheel_prizes set name = 'Changed' where id = prize1;
    raise exception 'Prize changed after sale';
  exception when raise_exception then if sqlerrm = 'Prize changed after sale' then raise; end if; end;

  -- Cash sale for a buyer-picked number is idempotent and queues a receipt.
  begin
    perform public.record_wheel_cash_sale(gen_random_uuid(),campaign,denied,'Cash Buyer','cash@example.invalid','',array[11],500);
    raise exception 'Unauthorised cash sale accepted';
  exception when raise_exception then if sqlerrm = 'Unauthorised cash sale accepted' then raise; end if; end;
  sale := public.record_wheel_cash_sale('00000000-0000-4000-8000-000000000011',campaign,operator_id,'Cash Buyer','cash@example.invalid','',array[11],500);
  replay := public.record_wheel_cash_sale('00000000-0000-4000-8000-000000000011',campaign,operator_id,'Cash Buyer','cash@example.invalid','',array[11],500);
  if sale <> replay or (select count(*) from public.raffle_tickets where raffle_order_id = (sale->>'orderId')::uuid) <> 1 then raise exception 'Cash replay duplicated'; end if;
  select id into strict jid from public.receipt_delivery_jobs where raffle_order_id = (sale->>'orderId')::uuid;
  update public.receipt_delivery_jobs set next_attempt_at = now() where id = jid;
  select * into claimed from public.claim_payment_receipt_job(jid,worker,300);
  if claimed.id is distinct from jid or not (select eligible from public.preflight_payment_receipt_job(jid,worker)) then raise exception 'Wheel cash receipt cannot be delivered'; end if;

  -- An abandoned hold is released by expiry; it must not block the draw.
  insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,selected_ticket_numbers)
    values(campaign,'Held','held@example.invalid',1,500,public.allocate_payment_reference('raffle'),array[12]) returning id into held_order;
  update public.raffle_orders set status = 'cancelled' where id = held_order;
  begin
    update public.raffle_orders set status = 'pending_payment' where id = held_order;
    raise exception 'Pending re-entry accepted';
  exception when raise_exception then if sqlerrm = 'Pending re-entry accepted' then raise; end if; end;

  -- Draw before draw time is refused.
  begin
    perform public.record_wheel_draw(campaign,prize1,3,'test',operator_id,null);
    raise exception 'Early draw accepted';
  exception when raise_exception then if sqlerrm = 'Early draw accepted' then raise; end if; end;
  -- Move the fixture window into the past (test-only bypass of the lock trigger).
  set local session_replication_role = replica;
  update public.raffle_campaigns set sales_open_at = now()-interval '4 hours', draw_at = now()-interval '1 minute' where id = campaign;
  set local session_replication_role = origin;
  begin
    insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,selected_ticket_numbers)
      values(campaign,'Late','late@example.invalid',1,500,public.allocate_payment_reference('raffle'),array[15]);
    raise exception 'Sale after draw time accepted';
  exception when raise_exception then if sqlerrm = 'Sale after draw time accepted' then raise; end if; end;
  begin
    perform public.record_wheel_draw(campaign,prize2,3,'test',operator_id,null);
    raise exception 'Prize 2 drawn before prize 1';
  exception when raise_exception then if sqlerrm = 'Prize 2 drawn before prize 1' then raise; end if; end;
  begin
    perform public.record_wheel_draw(campaign,prize1,25,'test',operator_id,null);
    raise exception 'Out of range number accepted';
  exception when raise_exception then if sqlerrm = 'Out of range number accepted' then raise; end if; end;

  -- Unsold number, then re-spin logged as unsold.
  d := public.record_wheel_draw(campaign,prize1,5,'crypto.randomInt(1,25)=5',operator_id,null);
  if d.ticket_id is not null or d.draw_number <> 1 or d.respin_reason is not null then raise exception 'Unsold draw recorded incorrectly'; end if;
  begin
    perform public.record_wheel_draw(campaign,prize1,3,'test',operator_id,null);
    raise exception 'Prize drawn twice without re-spin';
  exception when raise_exception then if sqlerrm = 'Prize drawn twice without re-spin' then raise; end if; end;
  d := public.record_wheel_draw(campaign,prize1,3,'crypto.randomInt(1,25)=3',operator_id,'no_winner');
  if d.ticket_id is null or d.respin_reason <> 'unsold' or d.draw_number <> 2 then raise exception 'Re-spin not logged as unsold'; end if;
  -- Ticket 3 already won: landing on it again is an already-won re-spin.
  d2 := public.record_wheel_draw(campaign,prize2,3,'crypto.randomInt(1,25)=3',operator_id,null);
  if d2.ticket_id is not null then raise exception 'A ticket won twice'; end if;
  d2 := public.record_wheel_draw(campaign,prize2,7,'crypto.randomInt(1,25)=7',operator_id,'no_winner');
  if d2.respin_reason <> 'already_won' or d2.ticket_id is null then raise exception 'Already-won spin misclassified: %', d2.respin_reason; end if;
  -- Winner of prize 2 does not claim: re-spin, then collection of the new winner.
  d2 := public.record_wheel_draw(campaign,prize2,11,'crypto.randomInt(1,25)=11',operator_id,'unclaimed');
  if d2.ticket_id is null or d2.respin_reason <> 'unclaimed' then raise exception 'Unclaimed re-spin not recorded'; end if;
  if not public.record_wheel_prize_collection(d2.id,operator_id,'Collected at bar') then raise exception 'Collection not recorded'; end if;
  if public.record_wheel_prize_collection(d2.id,operator_id,null) then raise exception 'Collection recorded twice'; end if;
  begin
    perform public.record_wheel_draw(campaign,prize2,3,'test',operator_id,'unclaimed');
    raise exception 'Collected prize re-spun';
  exception when raise_exception then if sqlerrm = 'Collected prize re-spun' then raise; end if; end;

  -- Draw records are append-only.
  begin
    update public.raffle_draws set winning_number = 1 where id = d.id;
    raise exception 'Draw updated';
  exception when raise_exception then if sqlerrm = 'Draw updated' then raise; end if; end;
  begin
    delete from public.raffle_draws where id = d.id;
    raise exception 'Draw deleted';
  exception when raise_exception then if sqlerrm = 'Draw deleted' then raise; end if; end;
  if has_table_privilege('service_role','public.raffle_draws','UPDATE') or has_table_privilege('service_role','public.raffle_draws','DELETE')
    or has_table_privilege('anon','public.raffle_draws','SELECT') or has_table_privilege('authenticated','public.raffle_wheel_prizes','SELECT')
    or has_function_privilege('authenticated','public.record_wheel_draw(uuid,uuid,integer,text,uuid,text)','EXECUTE') then
    raise exception 'Wheel records exposed or mutable';
  end if;
  -- Existing raffles are untouched.
  if exists(select 1 from public.raffle_campaigns where code in ('NDCCRAF','NDCCRRO') and kind <> 'standard') then raise exception 'Existing raffle kind changed'; end if;
end $$;
rollback;
