-- Disposable migration-replay database only. All fixtures roll back; no mail.
begin;
do $$
declare actor uuid; denied uuid; campaign uuid; oid uuid; jid uuid; worker uuid:=gen_random_uuid(); claimed record; mid uuid; sid uuid; eid uuid; card_id uuid; eid2 uuid;
begin
 insert into public.committee_users(email,full_name,password_hash,role) values(gen_random_uuid()||'@example.invalid','Bank test admin','test-only','admin') returning id into actor;
 insert into public.committee_users(email,full_name,password_hash,role) values(gen_random_uuid()||'@example.invalid','Bank denied','test-only','committee') returning id into denied;
 select id into strict campaign from public.raffle_campaigns where code='NDCCRAF';
 insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,payment_method,bank_transfer_selected_at)
 values(campaign,'Bank fixture','bank@example.invalid',2,1000,public.allocate_payment_reference('raffle'),'bank_transfer',now()) returning id into oid;
 if (select status from public.raffle_orders where id=oid)<>'pending_payment' or exists(select 1 from public.raffle_tickets where raffle_order_id=oid) then raise exception 'Selection issued tickets or paid the order'; end if;
 if (select public.raffle_has_payment_evidence(raffle_orders) from public.raffle_orders where id=oid) then raise exception 'Selection counted as bank receipt'; end if;
 begin
  perform public.confirm_special_bank_transfer('raffle',oid,denied,1000,'TEST-BANK');
  raise exception 'Unauthorised confirmation accepted';
 exception when raise_exception then if sqlerrm='Unauthorised confirmation accepted' then raise; end if; end;
 begin
  perform public.confirm_special_bank_transfer('raffle',oid,actor,999,'TEST-BANK');
  raise exception 'Incorrect amount accepted';
 exception when raise_exception then if sqlerrm='Incorrect amount accepted' then raise; end if; end;
 perform public.confirm_special_bank_transfer('raffle',oid,actor,1000,'TEST-BANK');
 if public.confirm_special_bank_transfer('raffle',oid,actor,1000,'TEST-BANK') then raise exception 'Duplicate confirmation accepted as new'; end if;
 if (select count(*) from public.raffle_tickets where raffle_order_id=oid)<>2 then raise exception 'Incorrect or duplicated ticket allocation'; end if;
 if not (select public.raffle_has_payment_evidence(raffle_orders) from public.raffle_orders where id=oid) then raise exception 'Confirmed bank receipt lacks evidence'; end if;
 select id into strict jid from public.receipt_delivery_jobs where raffle_order_id=oid;
 update public.receipt_delivery_jobs set next_attempt_at=now() where id=jid;
 select * into claimed from public.claim_payment_receipt_job(jid,worker,300);
 if claimed.id is distinct from jid or not (select eligible from public.preflight_payment_receipt_job(jid,worker)) then raise exception 'Bank raffle receipt cannot be delivered'; end if;
 -- A bank reservation keeps the purchaser's exact reverse-raffle numbers.
 select id into strict campaign from public.raffle_campaigns where code='NDCCRRO';
 insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,payment_method,bank_transfer_selected_at,selected_ticket_numbers)
 values(campaign,'Reverse bank fixture','reverse-bank@example.invalid',2,12000,public.allocate_payment_reference('raffle'),'bank_transfer',now()-interval '49 hours',array[201,202]) returning id into oid;
 -- Unconfirmed bank holds expire after 48 hours; a late deposit can still be
 -- confirmed while its numbers remain unsold and unheld.
 if exists(select 1 from public.reverse_raffle_unavailable_numbers() where ticket_number=201) then raise exception 'Expired bank hold still blocks numbers'; end if;
 perform public.confirm_special_bank_transfer('raffle',oid,actor,12000,'TEST-REVERSE');
 if (select array_agg(ticket_number order by ticket_number) from public.raffle_tickets where raffle_order_id=oid) is distinct from array[201,202] then raise exception 'Bank confirmation changed selected raffle numbers'; end if;
 if public.confirm_special_bank_transfer('raffle',oid,actor,12000,'TEST-REVERSE') then raise exception 'Duplicate reverse confirmation'; end if;
 -- A fresh bank hold still blocks its numbers for other checkouts.
 insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,payment_method,bank_transfer_selected_at,selected_ticket_numbers)
 values(campaign,'Fresh bank fixture','fresh-bank@example.invalid',1,6000,public.allocate_payment_reference('raffle'),'bank_transfer',now()-interval '47 hours',array[209]) returning id into oid;
 if not exists(select 1 from public.reverse_raffle_unavailable_numbers() where ticket_number=209) then raise exception 'Fresh bank hold was released early'; end if;
 begin
  insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,selected_ticket_numbers)
  values(campaign,'Card over fresh hold','card-fresh@example.invalid',1,6000,public.allocate_payment_reference('raffle'),array[209]);
  raise exception 'Fresh bank hold number was resold';
 exception when raise_exception then if sqlerrm='Fresh bank hold number was resold' then raise; end if; end;
 -- Race: an expired hold's number is re-held by a card checkout. Confirming
 -- the late deposit must fail without issuing a duplicate ticket.
 insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,payment_method,bank_transfer_selected_at,selected_ticket_numbers)
 values(campaign,'Expired bank fixture','expired-bank@example.invalid',2,12000,public.allocate_payment_reference('raffle'),'bank_transfer',now()-interval '49 hours',array[210,211]) returning id into oid;
 if exists(select 1 from public.reverse_raffle_unavailable_numbers() where ticket_number in (210,211)) then raise exception 'Expired bank hold still blocks numbers'; end if;
 insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,selected_ticket_numbers)
 values(campaign,'Card resale fixture','card-resale@example.invalid',1,6000,public.allocate_payment_reference('raffle'),array[211]) returning id into card_id;
 begin
  perform public.confirm_special_bank_transfer('raffle',oid,actor,12000,'TEST-EXPIRED');
  raise exception 'Expired hold confirmed over an active checkout';
 exception when raise_exception then
  if sqlerrm not like 'Reverse raffle numbers no longer available%' then raise; end if;
 end;
 if exists(select 1 from public.raffle_tickets where raffle_order_id=oid) or (select status from public.raffle_orders where id=oid)<>'pending_payment' then raise exception 'Failed confirmation changed the expired order'; end if;
 -- The card checkout pays: its ticket is issued once and the deposit still cannot be confirmed.
 perform public.issue_paid_raffle_tickets(card_id,'evt_wp2_resale','cs_wp2_resale','pi_wp2_resale');
 if (select count(*) from public.raffle_tickets t join public.raffle_campaigns c on c.id=t.campaign_id where c.code='NDCCRRO' and t.ticket_number=211)<>1 then raise exception 'Resold number not issued exactly once'; end if;
 begin
  perform public.confirm_special_bank_transfer('raffle',oid,actor,12000,'TEST-EXPIRED');
  raise exception 'Expired hold confirmed over a sold number';
 exception when raise_exception then
  if sqlerrm not like 'Reverse raffle numbers no longer available%' then raise; end if;
 end;
 if exists(select 1 from public.raffle_tickets where raffle_order_id=oid) then raise exception 'Duplicate ticket issued for resold number'; end if;
 -- The admin releases it with the existing cancel action.
 update public.raffle_orders set status='cancelled',updated_at=now() where id=oid and payment_method='bank_transfer' and status='pending_payment' and bank_transfer_confirmed_at is null and stripe_checkout_session_id is null and stripe_payment_intent_id is null;
 if (select status from public.raffle_orders where id=oid)<>'cancelled' then raise exception 'Expired hold could not be released'; end if;
 -- Exercise the admin endpoint's conditional cancellation against real holds.
 insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference,payment_method,bank_transfer_selected_at,selected_ticket_numbers)
 values(campaign,'Cancelled bank fixture','cancel-bank@example.invalid',1,6000,public.allocate_payment_reference('raffle'),'bank_transfer',now(),array[203]) returning id into oid;
 update public.raffle_orders set status='cancelled',updated_at=now() where id=oid and payment_method='bank_transfer' and status='pending_payment' and bank_transfer_confirmed_at is null and stripe_checkout_session_id is null and stripe_payment_intent_id is null;
 if exists(select 1 from public.reverse_raffle_unavailable_numbers() where ticket_number=203) then raise exception 'Cancelled bank reservation still holds number'; end if;
 if exists(select 1 from public.raffle_tickets where raffle_order_id=oid) or exists(select 1 from public.receipt_delivery_jobs where raffle_order_id=oid) then raise exception 'Cancellation issued a ticket or receipt'; end if;
 begin
  perform public.confirm_special_bank_transfer('raffle',oid,actor,6000,'TEST-CANCELLED');
  raise exception 'Cancelled bank order was paid';
 exception when raise_exception then if sqlerrm='Cancelled bank order was paid' then raise; end if; end;
 insert into public.fantasy_seasons(name,slug,is_public,auto_sync_enabled) values('Bank fixture','bank-fixture-'||gen_random_uuid(),false,false) returning id into sid;
 insert into public.fantasy_managers(display_name,email,team_name) values('Bank fixture',gen_random_uuid()||'@example.invalid','Bank fixture') returning id into mid;
 insert into public.fantasy_entries(manager_id,season_id,entry_fee_cents,currency,payment_reference,bank_transfer_selected_at) values(mid,sid,2500,'AUD',public.allocate_payment_reference('dino_coach'),now()) returning id into eid;
 if (select public.dino_has_payment_evidence(fantasy_entries) from public.fantasy_entries where id=eid) then raise exception 'Dino selection counted as bank receipt'; end if;
 perform public.confirm_special_bank_transfer('dino',eid,actor,2500,'TEST-DINO');
 if public.confirm_special_bank_transfer('dino',eid,actor,2500,'TEST-DINO') then raise exception 'Duplicate Dino receipt'; end if;
 select id into strict jid from public.receipt_delivery_jobs where dino_entry_id=eid;
 update public.receipt_delivery_jobs set next_attempt_at=now() where id=jid;
 select * into claimed from public.claim_payment_receipt_job(jid,worker,300);
 if claimed.id is distinct from jid or not (select eligible from public.preflight_payment_receipt_job(jid,worker)) then raise exception 'Dino bank receipt cannot be delivered'; end if;
 -- An administrator can switch an unconfirmed Dino bank selection back to card.
 insert into public.fantasy_managers(display_name,email,team_name) values('Switch fixture',gen_random_uuid()||'@example.invalid','Switch fixture') returning id into mid;
 insert into public.fantasy_entries(manager_id,season_id,entry_fee_cents,currency,payment_reference,bank_transfer_selected_at) values(mid,sid,2500,'AUD',public.allocate_payment_reference('dino_coach'),now()) returning id into eid2;
 begin
  perform public.switch_dino_bank_transfer_to_card(eid2,denied);
  raise exception 'Non-admin switched payment method';
 exception when raise_exception then if sqlerrm='Non-admin switched payment method' then raise; end if; end;
 if not public.switch_dino_bank_transfer_to_card(eid2,actor) then raise exception 'Unconfirmed Dino switch refused'; end if;
 if (select bank_transfer_selected_at from public.fantasy_entries where id=eid2) is not null then raise exception 'Dino bank selection not cleared'; end if;
 if not exists(select 1 from public.fantasy_admin_events where manager_id=mid and actor_id=actor and action='bank_transfer_switched_to_card') then raise exception 'Dino switch not audited'; end if;
 if public.switch_dino_bank_transfer_to_card(eid2,actor) then raise exception 'Repeated switch reported a change'; end if;
 begin
  perform public.confirm_special_bank_transfer('dino',eid2,actor,2500,'TEST-SWITCHED');
  raise exception 'Switched Dino entry confirmed as bank payment';
 exception when raise_exception then if sqlerrm='Switched Dino entry confirmed as bank payment' then raise; end if; end;
 if public.switch_dino_bank_transfer_to_card(eid,actor) then raise exception 'Paid Dino entry switched to card'; end if;
 if (select status from public.fantasy_entries where id=eid)<>'paid' or (select bank_transfer_confirmed_at from public.fantasy_entries where id=eid) is null then raise exception 'Paid Dino entry changed'; end if;
 if has_function_privilege('anon','public.switch_dino_bank_transfer_to_card(uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','public.switch_dino_bank_transfer_to_card(uuid,uuid)','EXECUTE') then raise exception 'Browser can switch Dino payment method'; end if;
 if has_function_privilege('anon','public.confirm_special_bank_transfer(text,uuid,uuid,integer,text)','EXECUTE') or has_function_privilege('authenticated','public.confirm_special_bank_transfer(text,uuid,uuid,integer,text)','EXECUTE') then raise exception 'Browser can confirm bank payments'; end if;
end $$;
rollback;
