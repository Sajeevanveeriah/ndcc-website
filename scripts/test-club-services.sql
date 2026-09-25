-- Only run inside the disposable migration-replay database. No emails sent.
begin;
do $$
declare actor uuid; denied uuid; key uuid:=gen_random_uuid(); sale jsonb; replay jsonb; oid uuid; jid uuid; worker uuid:=gen_random_uuid(); claimed record; campaign uuid; card_order uuid; before_n integer;
begin
 insert into public.committee_users(email,full_name,password_hash,role,cms_permissions) values(gen_random_uuid()||'@example.invalid','Cash fixture','test-only','committee',array['raffle']) returning id into actor;
 insert into public.committee_users(email,full_name,password_hash,role,cms_permissions) values(gen_random_uuid()||'@example.invalid','No permission','test-only','committee','{}') returning id into denied;
 select id,next_ticket_number into campaign,before_n from public.raffle_campaigns where code='NDCCRAF';
 update public.raffle_campaigns set active=true,draw_at=now()+interval '30 days' where id=campaign;
 begin
  perform public.record_cash_trailer_sale(key,denied,'Buyer','cash@example.invalid','',2,500);
  raise exception 'Unauthorised actor accepted';
 exception when raise_exception then if sqlerrm='Unauthorised actor accepted' then raise; end if; end;
 begin
  perform public.record_cash_trailer_sale(key,actor,'Buyer','cash@example.invalid','',2,499);
  raise exception 'Changed quote accepted';
 exception when raise_exception then if sqlerrm='Changed quote accepted' then raise; end if; end;
 if (select next_ticket_number from public.raffle_campaigns where id=campaign)<>before_n then raise exception 'Rejected sale consumed numbers'; end if;
 sale:=public.record_cash_trailer_sale(key,actor,'Buyer','cash@example.invalid','',2,500);oid:=(sale->>'orderId')::uuid;
 replay:=public.record_cash_trailer_sale(key,actor,'Buyer','cash@example.invalid','',2,500);
 if sale<>replay or (select count(*) from public.raffle_tickets where raffle_order_id=oid)<>2 then raise exception 'Sale replay allocated duplicates'; end if;
 if exists(select 1 from public.raffle_tickets where raffle_order_id=oid and ticket_reference !~ '^NDCCTRO-2026[0-9]{4}$') then raise exception 'Wrong trailer ticket format'; end if;
 if not exists(select 1 from public.raffle_orders where id=oid and status='paid' and amount_cents=1000 and payment_method='cash' and stripe_payment_intent_id is null and cash_received_by=actor) then raise exception 'Cash payment evidence lost'; end if;
 select id into strict jid from public.receipt_delivery_jobs where raffle_order_id=oid;
 update public.receipt_delivery_jobs set next_attempt_at=now() where id=jid;
 select * into claimed from public.claim_payment_receipt_job(jid,worker,300);
 if claimed.id is distinct from jid then raise exception 'Cash receipt could not be claimed'; end if;
 if not (select eligible from public.preflight_payment_receipt_job(jid,worker)) then raise exception 'Cash receipt preflight failed'; end if;
 begin
  perform public.record_cash_trailer_sale(key,actor,'Different buyer','cash@example.invalid','',2,500);
  raise exception 'Conflicting sale replay accepted';
 exception when raise_exception then if sqlerrm='Conflicting sale replay accepted' then raise; end if; end;
 begin
  update public.raffle_orders set stripe_payment_intent_id='pi_fake' where id=oid;
  raise exception 'Cash/Stripe evidence mixed';
 exception when check_violation then null; end;
 -- Card sales must share the same sequence and retain Stripe evidence.
 insert into public.raffle_orders(campaign_id,customer_name,customer_email,quantity,amount_cents,payment_reference)
 values(campaign,'Card fixture','card@example.invalid',1,500,public.allocate_payment_reference('raffle')) returning id into card_order;
 perform * from public.issue_paid_raffle_tickets(card_order,'evt_club_card','cs_club_card','pi_club_card');
 perform * from public.issue_paid_raffle_tickets(card_order,'evt_club_card','cs_club_card','pi_club_card');
 if (select count(*) from public.raffle_tickets where raffle_order_id=card_order)<>1
 or not exists(select 1 from public.raffle_tickets where raffle_order_id=card_order and ticket_number=before_n+2 and ticket_reference ~ '^NDCCTRO-2026[0-9]{4}$') then raise exception 'Card/cash sequence or replay regression'; end if;
 if not exists(select 1 from public.raffle_orders where id=card_order and payment_method='stripe' and stripe_payment_intent_id='pi_club_card' and public.raffle_has_payment_evidence(raffle_orders)) then raise exception 'Card evidence regression'; end if;
 if has_table_privilege('anon','public.club_members','SELECT') or has_table_privilege('authenticated','public.club_members','UPDATE')
 or has_table_privilege('authenticated','public.club_member_directory','SELECT')
 or has_function_privilege('authenticated','public.record_cash_trailer_sale(uuid,uuid,text,text,text,integer,integer)','EXECUTE') then raise exception 'Private club operations exposed to browsers'; end if;
 if not exists(select 1 from public.social_membership_plans where product_code='pot_club_2026_27' and price=100 and is_active) then raise exception 'Pot Club product not available at approved price'; end if;
end $$;
rollback;
begin;
do $$
declare uid uuid:=gen_random_uuid(); mid uuid; other_mid uuid; sale jsonb; replay jsonb; k uuid:=gen_random_uuid(); oid uuid; jid uuid; worker uuid:=gen_random_uuid(); before_n integer;
begin
 insert into auth.users(id,email,email_confirmed_at) values(uid,'collector@example.invalid',now());
 insert into public.club_members(auth_user_id,full_name,email,member_type,privacy_accepted_at) values(uid,'Member collector','collector@example.invalid','social',now()) returning id into mid;
 insert into public.club_members(full_name,email,member_type) values('Other collector','other@example.invalid','player') returning id into other_mid;
 update public.raffle_campaigns set active=true,public_visibility_mode='visible',draw_at=now()+interval '30 days' where code='NDCCRAF';
 select next_ticket_number into before_n from public.raffle_campaigns where code='NDCCRAF';
 if before_n<>200 then raise exception 'Trailer sequence must begin at 200 in a fresh replay'; end if;
 -- Self-registration alone must never be enough to issue paid draw entries.
 begin
  perform public.record_member_cash_trailer_sale(k,mid,'Buyer','buyer@example.invalid','',2,500);
  raise exception 'Pending member accepted';
 exception when raise_exception then if sqlerrm='Pending member accepted' then raise; end if; end;
 if (select next_ticket_number from public.raffle_campaigns where code='NDCCRAF')<>200 then raise exception 'Pending signup consumed tickets'; end if;
 update public.club_members set membership_status='active' where id=mid;
 sale:=public.record_member_cash_trailer_sale(k,mid,'Buyer','buyer@example.invalid','',2,500);oid:=(sale->>'orderId')::uuid;
 replay:=public.record_member_cash_trailer_sale(k,mid,'Buyer','buyer@example.invalid','',2,500);
 if sale<>replay then raise exception 'Member sale retry changed result'; end if;
 if sale->'ticketReferences' <> '["NDCCTRO-20260200","NDCCTRO-20260201"]'::jsonb then raise exception 'Wrong member starting tickets: %',sale; end if;
 if not exists(select 1 from public.raffle_orders where id=oid and cash_received_by_member=mid and cash_received_by is null and cash_handed_in_at is null and status='paid' and public.raffle_has_payment_evidence(raffle_orders)) then raise exception 'Member collection evidence missing'; end if;
 select id into strict jid from public.receipt_delivery_jobs where raffle_order_id=oid;
 update public.receipt_delivery_jobs set next_attempt_at=now() where id=jid;
 perform * from public.claim_payment_receipt_job(jid,worker,300);
 if not (select eligible from public.preflight_payment_receipt_job(jid,worker)) then raise exception 'Member ticket email preflight rejected'; end if;
 begin
  perform public.record_member_cash_trailer_sale(k,other_mid,'Buyer','buyer@example.invalid','',2,500);
  raise exception 'Different member recovered sale';
 exception when raise_exception then if sqlerrm='Different member recovered sale' then raise; end if; end;
 update public.club_members set membership_status='inactive' where id=mid;
 begin
  perform public.record_member_cash_trailer_sale(gen_random_uuid(),mid,'Buyer','buyer@example.invalid','',1,500);
  raise exception 'Inactive member accepted';
 exception when raise_exception then if sqlerrm='Inactive member accepted' then raise; end if; end;
 update public.club_members set membership_status='active' where id=mid;
 update auth.users set email_confirmed_at=null where id=uid;
 begin
  perform public.record_member_cash_trailer_sale(gen_random_uuid(),mid,'Buyer','buyer@example.invalid','',1,500);
  raise exception 'Unconfirmed member accepted';
 exception when raise_exception then if sqlerrm='Unconfirmed member accepted' then raise; end if; end;
 update auth.users set email_confirmed_at=now() where id=uid;
 update public.raffle_campaigns set public_visibility_mode='hidden' where code='NDCCRAF';
 begin
  perform public.record_member_cash_trailer_sale(gen_random_uuid(),mid,'Buyer','buyer@example.invalid','',1,500);
  raise exception 'Hidden raffle accepted member sale';
 exception when raise_exception then if sqlerrm='Hidden raffle accepted member sale' then raise; end if; end;
 if (select next_ticket_number from public.raffle_campaigns where code='NDCCRAF')<>202 then raise exception 'Rejected member sales consumed numbers'; end if;
 if has_function_privilege('authenticated','public.record_member_cash_trailer_sale(uuid,uuid,text,text,text,integer,integer)','EXECUTE')
 or has_function_privilege('anon','public.record_member_cash_trailer_sale(uuid,uuid,text,text,text,integer,integer)','EXECUTE')
 or has_function_privilege('service_role','public.record_trailer_cash_sale_for_collector(uuid,uuid,text,text,text,text,integer,integer)','EXECUTE') then raise exception 'Collector checks exposed for direct calls'; end if;
end $$;
do $$
declare mid uuid;
begin
 if has_table_privilege('anon','public.club_account_preferences','SELECT')
 or has_table_privilege('authenticated','public.club_account_preferences','UPDATE')
 or not has_table_privilege('service_role','public.club_account_preferences','INSERT') then
  raise exception 'Member preference table grants are unsafe';
 end if;
 if not (select relrowsecurity from pg_class where oid='public.club_account_preferences'::regclass) then raise exception 'Preference RLS missing'; end if;
 insert into public.club_members(full_name,email,member_type) values('Preference test','preferences@example.invalid','social') returning id into mid;
 insert into public.club_account_preferences(member_id) values(mid);
 if (select email_updates from public.club_account_preferences where member_id=mid) then raise exception 'Email consent must default to false'; end if;
 update public.club_account_preferences set interests=array['club_news'],volunteering=array['events'],email_updates=true where member_id=mid;
 begin
  update public.club_account_preferences set interests=array['admin'] where member_id=mid;
  raise exception 'Invalid preference accepted';
 exception when check_violation then null; end;
 begin
  update public.club_account_preferences set volunteering=array[null]::text[] where member_id=mid;
  raise exception 'Null volunteering choice accepted';
 exception when check_violation then null; end;
 delete from public.club_members where id=mid;
 if exists(select 1 from public.club_account_preferences where member_id=mid) then raise exception 'Orphan preferences remain'; end if;
end $$;
rollback;
