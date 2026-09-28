-- Disposable migration-replay database only. All fixtures roll back; no mail.
-- Spin the Wheel: free top-up idempotency, atomic spins with stock, spins
-- granted only on full payment through the real order ledger, revoked on
-- refund, segment deletion keeps result snapshots, and privileges.
begin;
do $$
declare
  wheel uuid; seg_again uuid; seg_cap uuid; seg_none uuid; user_a uuid := gen_random_uuid(); pass_a uuid;
  ord uuid; link uuid; res jsonb; n integer; saved uuid; ids uuid[];
begin
  -- Wheel with 3 segments: "Again" unlimited, "Cap" 1 in stock, "None" weight 0.
  wheel := public.save_spin_wheel(jsonb_build_object(
    'name','Test wheel','description','','status','live','starts_at','','ends_at','',
    'free_spins_per_account',2,'spin_price_cents',200,'max_spins_per_order',20,'claim_instructions','',
    'public_visibility_mode','visible','public_opens_at','',
    'segments',jsonb_build_array(
      jsonb_build_object('label','Again','prize_name','','prize_description','','is_prize',false,'weight',9,'stock','','colour','navy'),
      jsonb_build_object('label','Cap','prize_name','Club cap','prize_description','','is_prize',true,'weight',1,'stock',1,'colour','gold'),
      jsonb_build_object('label','None','prize_name','','prize_description','','is_prize',false,'weight',0,'stock','','colour','cream'))), null);
  select id into seg_again from public.spin_wheel_segments where wheel_id = wheel and position = 1;
  select id into seg_cap from public.spin_wheel_segments where wheel_id = wheel and position = 2;
  select id into seg_none from public.spin_wheel_segments where wheel_id = wheel and position = 3;
  if seg_again is null or seg_cap is null or seg_none is null then raise exception 'segments not saved in order'; end if;

  -- Free spins: top-up is idempotent, including when called repeatedly.
  perform public.ensure_spin_wheel_free_entitlements(wheel, user_a);
  perform public.ensure_spin_wheel_free_entitlements(wheel, user_a);
  perform public.ensure_spin_wheel_free_entitlements(wheel, user_a);
  select count(*) into n from public.spin_wheel_entitlements where wheel_id = wheel and auth_user_id = user_a;
  if n <> 2 then raise exception 'free top-up granted % spins, expected 2', n; end if;

  -- Spin 1 wins the only cap; stock goes to 0.
  res := public.record_spin_wheel_result(wheel, user_a, null, seg_cap, 'test', 'SPIN-AAAAA1', 'a@example.invalid', 'A');
  if (res->>'is_prize')::boolean is not true or (res->>'spins_left')::integer <> 1 then raise exception 'unexpected spin 1 %', res; end if;
  if (select stock from public.spin_wheel_segments where id = seg_cap) <> 0 then raise exception 'stock not decremented'; end if;
  -- The cap cannot be won again.
  begin
    perform public.record_spin_wheel_result(wheel, user_a, null, seg_cap, 'test', 'SPIN-AAAAA2', null, null);
    raise exception 'out-of-stock segment accepted';
  exception when others then
    if sqlerrm not like '%spin_wheel:segment_out_of_stock%' then raise; end if;
  end;
  -- That failed attempt used no spin.
  if (select count(*) from public.spin_wheel_entitlements where auth_user_id = user_a and used_at is null) <> 1 then raise exception 'failed spin consumed an entitlement'; end if;
  -- Weight 0 segments cannot be recorded.
  begin
    perform public.record_spin_wheel_result(wheel, user_a, null, seg_none, 'test', 'SPIN-AAAAA3', null, null);
    raise exception 'zero-weight segment accepted';
  exception when others then
    if sqlerrm not like '%spin_wheel:segment_unavailable%' then raise; end if;
  end;
  perform public.record_spin_wheel_result(wheel, user_a, null, seg_again, 'test', 'SPIN-AAAAA4', null, null);
  begin
    perform public.record_spin_wheel_result(wheel, user_a, null, seg_again, 'test', 'SPIN-AAAAA5', null, null);
    raise exception 'spin without entitlement accepted';
  exception when others then
    if sqlerrm not like '%spin_wheel:no_spins_left%' then raise; end if;
  end;
  -- Topping up again never re-grants used free spins.
  perform public.ensure_spin_wheel_free_entitlements(wheel, user_a);
  if (select count(*) from public.spin_wheel_entitlements where auth_user_id = user_a and used_at is null) <> 0 then raise exception 'used free spins were re-granted'; end if;

  -- Paid spins through the real order ledger (guest pass).
  insert into public.spin_wheel_passes(wheel_id, token_hash, email, name)
    values (wheel, encode(extensions.digest('pass-a', 'sha256'), 'hex'), 'guest@example.invalid', 'Guest') returning id into pass_a;
  insert into public.orders(customer_name, customer_email, customer_phone, items, total_amount, order_category, order_status, payment_status, payment_reference)
    values ('Guest', 'guest@example.invalid', '', '[{"name":"Spin the Wheel - Test wheel","quantity":3,"price":2}]'::jsonb, 6.00, 'spin_wheel', 'submitted', 'pending_bank_transfer', 'NDCCPAY-2026-990001')
    returning id into ord;
  insert into public.spin_wheel_orders(wheel_id, order_id, pass_id, quantity, unit_price_cents) values (wheel, ord, pass_a, 3, 200) returning id into link;
  -- Part payment grants nothing.
  insert into public.order_payments(order_id, amount, method, status, received_at, recorded_by, payment_reference) values (ord, 2.00, 'bank_transfer', 'settled', now(), 'test', 'NDCCPAY-2026-990001');
  if (select payment_status from public.orders where id = ord) = 'paid' then raise exception 'part payment marked paid'; end if;
  if exists (select 1 from public.spin_wheel_entitlements where spin_order_id = link) then raise exception 'spins granted before full payment'; end if;
  -- Full payment grants exactly 3, and re-syncing never adds more.
  insert into public.order_payments(order_id, amount, method, status, received_at, recorded_by, payment_reference) values (ord, 4.00, 'bank_transfer', 'settled', now(), 'test', 'NDCCPAY-2026-990002');
  if (select payment_status from public.orders where id = ord) <> 'paid' then raise exception 'order not paid after full payment'; end if;
  if (select count(*) from public.spin_wheel_entitlements where spin_order_id = link) <> 3 then raise exception 'paid order did not grant 3 spins'; end if;
  perform public.sync_spin_wheel_order_entitlements(ord);
  perform public.sync_spin_wheel_order_entitlements(ord);
  if (select count(*) from public.spin_wheel_entitlements where spin_order_id = link) <> 3 then raise exception 're-sync over-granted'; end if;
  if (select paid_at from public.spin_wheel_orders where id = link) is null then raise exception 'paid_at not recorded'; end if;
  -- Guest uses one spin with the pass.
  perform public.record_spin_wheel_result(wheel, null, pass_a, seg_again, 'test', 'SPIN-BBBBB1', 'guest@example.invalid', 'Guest');
  -- A refund revokes the 2 unused spins; the used one stays on record.
  insert into public.order_payments(order_id, amount, method, status, received_at, recorded_by, payment_reference) values (ord, 6.00, 'bank_transfer', 'refunded', now(), 'test', 'NDCCPAY-2026-990003');
  if (select payment_status from public.orders where id = ord) = 'paid' then raise exception 'refund left the order paid'; end if;
  if (select count(*) from public.spin_wheel_entitlements where spin_order_id = link and used_at is null and revoked_at is null) <> 0 then raise exception 'refund did not revoke unused spins'; end if;
  if (select count(*) from public.spin_wheel_entitlements where spin_order_id = link and used_at is not null) <> 1 then raise exception 'used spin lost'; end if;
  begin
    perform public.record_spin_wheel_result(wheel, null, pass_a, seg_again, 'test', 'SPIN-BBBBB2', null, null);
    raise exception 'revoked spin accepted';
  exception when others then
    if sqlerrm not like '%spin_wheel:no_spins_left%' then raise; end if;
  end;

  -- Paused wheels refuse spins.
  update public.spin_wheels set status = 'paused' where id = wheel;
  perform public.ensure_spin_wheel_free_entitlements(wheel, gen_random_uuid());
  begin
    perform public.record_spin_wheel_result(wheel, user_a, null, seg_again, 'test', 'SPIN-CCCCC1', null, null);
    raise exception 'paused wheel accepted a spin';
  exception when others then
    if sqlerrm not like '%spin_wheel:not_live%' then raise; end if;
  end;

  -- Saving without the won "Cap" segment deletes it; its results keep the snapshot.
  saved := public.save_spin_wheel(jsonb_build_object(
    'id', wheel, 'name','Test wheel','description','','status','live','starts_at','','ends_at','',
    'free_spins_per_account',2,'spin_price_cents',200,'max_spins_per_order',20,'claim_instructions','',
    'public_visibility_mode','visible','public_opens_at','',
    'segments',jsonb_build_array(
      jsonb_build_object('id',seg_none,'label','None','prize_name','','prize_description','','is_prize',false,'weight',5,'stock','','colour','cream'),
      jsonb_build_object('id',seg_again,'label','Again','prize_name','','prize_description','','is_prize',false,'weight',9,'stock','','colour','navy'))), null);
  if saved <> wheel then raise exception 'save returned a different wheel'; end if;
  if exists (select 1 from public.spin_wheel_segments where id = seg_cap) then raise exception 'removed segment still present'; end if;
  if (select position from public.spin_wheel_segments where id = seg_none) <> 1 or (select position from public.spin_wheel_segments where id = seg_again) <> 2 then raise exception 'segments not reordered'; end if;
  select array_agg(segment_id) into ids from public.spin_wheel_results where reference = 'SPIN-AAAAA1';
  if ids[1] is not null or (select prize_name from public.spin_wheel_results where reference = 'SPIN-AAAAA1') <> 'Club cap' then raise exception 'won result lost its snapshot'; end if;
  -- A single segment is refused.
  begin
    perform public.save_spin_wheel(jsonb_build_object('id', wheel, 'name','Test wheel','status','live','free_spins_per_account',0,'max_spins_per_order',1,'public_visibility_mode','hidden',
      'segments',jsonb_build_array(jsonb_build_object('label','Only','weight',1,'colour','navy'))), null);
    raise exception 'one-segment wheel accepted';
  exception when others then
    if sqlerrm not like '%spin_wheel:segment_count%' then raise; end if;
  end;

  -- Only one wheel can be live at a time.
  update public.spin_wheels set status = 'live' where id = wheel;
  begin
    insert into public.spin_wheels(name, status) values ('Second wheel', 'live');
    raise exception 'second live wheel accepted';
  exception when unique_violation then null; end;
  insert into public.spin_wheels(name, status) values ('Draft wheel', 'draft');

  -- Lowering the free allowance revokes unused free spins above it; raising restores them.
  user_a := gen_random_uuid();
  update public.spin_wheels set free_spins_per_account = 3 where id = wheel;
  perform public.ensure_spin_wheel_free_entitlements(wheel, user_a);
  perform public.record_spin_wheel_result(wheel, user_a, null, seg_again, 'test', 'SPIN-DDDDD1', null, null);
  update public.spin_wheels set free_spins_per_account = 1 where id = wheel;
  perform public.ensure_spin_wheel_free_entitlements(wheel, user_a);
  if (select count(*) from public.spin_wheel_entitlements where auth_user_id = user_a and used_at is null and revoked_at is null) <> 0 then
    raise exception 'lowered allowance left unused free spins';
  end if;
  if (select count(*) from public.spin_wheel_entitlements where auth_user_id = user_a and used_at is not null) <> 1 then raise exception 'used free spin lost'; end if;
  update public.spin_wheels set free_spins_per_account = 3 where id = wheel;
  perform public.ensure_spin_wheel_free_entitlements(wheel, user_a);
  if (select count(*) from public.spin_wheel_entitlements where auth_user_id = user_a and used_at is null and revoked_at is null) <> 2 then
    raise exception 'raised allowance did not restore free spins';
  end if;

  -- The cron's work list holds only orders that still need work.
  alter table public.orders disable trigger spin_wheel_order_payment;
  insert into public.orders(customer_name, customer_email, customer_phone, items, total_amount, order_category, order_status, payment_status, payment_reference)
    values ('Guest two', 'guest2@example.invalid', '', '[]'::jsonb, 2.00, 'spin_wheel', 'submitted', 'pending_bank_transfer', 'NDCCPAY-2026-990010')
    returning id into ord;
  insert into public.spin_wheel_orders(wheel_id, order_id, pass_id, quantity, unit_price_cents) values (wheel, ord, pass_a, 1, 200) returning id into link;
  if exists (select 1 from public.spin_wheel_orders_needing_work(now() - interval '1 day', 100) w where w.id = link) then raise exception 'unpaid order listed as work'; end if;
  update public.orders set payment_status = 'paid', amount_paid = 2.00 where id = ord;  -- trigger off: spins missing
  if not exists (select 1 from public.spin_wheel_orders_needing_work(now() - interval '1 day', 100) w where w.id = link) then raise exception 'paid order with missing spins not listed'; end if;
  if exists (select 1 from public.spin_wheel_orders_needing_work(now() - interval '1 day', 100, array[link]) w where w.id = link) then raise exception 'skip_ids ignored'; end if;
  alter table public.orders enable trigger spin_wheel_order_payment;
  perform public.sync_spin_wheel_order_entitlements(ord);
  -- Synced, but the guest link is still unsent: still listed.
  if not exists (select 1 from public.spin_wheel_orders_needing_work(now() - interval '1 day', 100) w where w.id = link) then raise exception 'unsent guest link not listed'; end if;
  update public.spin_wheel_orders set pass_emailed_at = now() where id = link;
  if exists (select 1 from public.spin_wheel_orders_needing_work(now() - interval '1 day', 100) w where w.id = link) then raise exception 'finished order still listed'; end if;

  -- Browser roles have no direct access.
  if has_table_privilege('anon', 'public.spin_wheel_results', 'select') or has_table_privilege('authenticated', 'public.spin_wheel_entitlements', 'insert')
     or has_function_privilege('anon', 'public.record_spin_wheel_result(uuid,uuid,uuid,uuid,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.ensure_spin_wheel_free_entitlements(uuid,uuid)', 'execute') then
    raise exception 'browser roles can reach Spin the Wheel data';
  end if;
end $$;
rollback;
