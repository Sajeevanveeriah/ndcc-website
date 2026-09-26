-- Disposable migration-replay database only. All fixtures roll back; no mail.
begin;
do $$
declare actor uuid; denied uuid; campaign uuid; oid uuid; jid uuid; worker uuid:=gen_random_uuid(); claimed record; mid uuid; sid uuid; eid uuid;
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
 values(campaign,'Reverse bank fixture','reverse-bank@example.invalid',2,12000,public.allocate_payment_reference('raffle'),'bank_transfer',now()-interval '2 days',array[201,202]) returning id into oid;
 if not exists(select 1 from public.reverse_raffle_unavailable_numbers() where ticket_number=201) then raise exception 'Bank reservation was released before payment'; end if;
 perform public.confirm_special_bank_transfer('raffle',oid,actor,12000,'TEST-REVERSE');
 if (select array_agg(ticket_number order by ticket_number) from public.raffle_tickets where raffle_order_id=oid) is distinct from array[201,202] then raise exception 'Bank confirmation changed selected raffle numbers'; end if;
 if public.confirm_special_bank_transfer('raffle',oid,actor,12000,'TEST-REVERSE') then raise exception 'Duplicate reverse confirmation'; end if;
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
 if has_function_privilege('anon','public.confirm_special_bank_transfer(text,uuid,uuid,integer,text)','EXECUTE') or has_function_privilege('authenticated','public.confirm_special_bank_transfer(text,uuid,uuid,integer,text)','EXECUTE') then raise exception 'Browser can confirm bank payments'; end if;
end $$;
rollback;
