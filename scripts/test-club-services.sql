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
