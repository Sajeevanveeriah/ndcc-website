-- Disposable migration-replay database only. All fixtures roll back; no mail.
-- Spin the Wheel (20260928150000): spins per person per Melbourne day, prizes
-- won once per person with a free bonus spin on a repeat, the daily capacity
-- used by checkout, saved settings and the winner receipt copy list.
begin;
do $$
declare
  wheel uuid; seg_raffle uuid; seg_drink uuid; seg_none uuid;
  user_a uuid := gen_random_uuid(); user_b uuid := gen_random_uuid(); pass_a uuid;
  res jsonb; cap jsonb;
begin
  -- Any other live wheel from earlier fixtures would block this one.
  update public.spin_wheels set status = 'ended' where status = 'live';
  wheel := public.save_spin_wheel(jsonb_build_object(
    'name','Daily wheel','description','','status','live','starts_at','','ends_at','',
    'free_spins_per_account',0,'spin_price_cents',500,'max_spins_per_order',3,'max_spins_per_day',3,'claim_instructions','Show at the bar',
    'public_visibility_mode','visible','public_opens_at','',
    'segments',jsonb_build_array(
      jsonb_build_object('label','Raffle entry','prize_name','Raffle entry','prize_description','One entry','is_prize',true,'once_per_spinner',true,'weight',1,'stock',5,'colour','gold'),
      jsonb_build_object('label','Drink','prize_name','Drink at the bar','prize_description','','is_prize',true,'weight',1,'stock',2,'colour','maroon'),
      jsonb_build_object('label','Try again','prize_name','','prize_description','','is_prize',false,'weight',3,'stock','','colour','navy'))), null);
  select id into seg_raffle from public.spin_wheel_segments where wheel_id = wheel and position = 1;
  select id into seg_drink from public.spin_wheel_segments where wheel_id = wheel and position = 2;
  select id into seg_none from public.spin_wheel_segments where wheel_id = wheel and position = 3;
  if (select max_spins_per_day from public.spin_wheels where id = wheel) <> 3 then raise exception 'daily limit not saved'; end if;
  if not (select once_per_spinner from public.spin_wheel_segments where id = seg_raffle) then raise exception 'once per person not saved'; end if;
  if (select once_per_spinner from public.spin_wheel_segments where id = seg_drink) then raise exception 'once per person set on the wrong segment'; end if;

  insert into public.spin_wheel_entitlements (wheel_id, auth_user_id, source)
    select wheel, user_a, 'admin_grant' from generate_series(1, 5);

  -- First raffle win is a real prize and uses stock.
  res := public.record_spin_wheel_result(wheel, user_a, null, seg_raffle, 'test', 'SPIN-DAAAA1', 'A@Example.invalid', 'A');
  if (res->>'is_prize')::boolean is not true or (res->>'repeat_bonus')::boolean then raise exception 'first raffle win wrong %', res; end if;
  if (select stock from public.spin_wheel_segments where id = seg_raffle) <> 4 then raise exception 'raffle stock not used'; end if;

  -- Second raffle landing: no prize, no stock, a bonus spin instead.
  res := public.record_spin_wheel_result(wheel, user_a, null, seg_raffle, 'test', 'SPIN-DAAAA2', 'a@example.invalid', 'A');
  if (res->>'is_prize')::boolean or not (res->>'repeat_bonus')::boolean then raise exception 'repeat raffle not converted %', res; end if;
  if (select stock from public.spin_wheel_segments where id = seg_raffle) <> 4 then raise exception 'repeat used raffle stock'; end if;
  if (res->>'spins_left')::integer <> 4 then raise exception 'bonus spin not added, spins left %', res->>'spins_left'; end if;
  if (select count(*) from public.spin_wheel_entitlements where wheel_id = wheel and source = 'bonus' and bonus_from_result = (res->>'id')::uuid) <> 1 then
    raise exception 'bonus entitlement not linked to its result';
  end if;

  -- The bonus spin is used first and does not count towards today's 3.
  perform public.record_spin_wheel_result(wheel, user_a, null, seg_none, 'test', 'SPIN-DAAAA3', 'a@example.invalid', 'A');
  if exists (select 1 from public.spin_wheel_entitlements where wheel_id = wheel and source = 'bonus' and used_at is null) then raise exception 'bonus spin not used first'; end if;
  cap := public.spin_wheel_daily_capacity(wheel, user_a, 'a@example.invalid');
  if (cap->>'used_today')::integer <> 2 then raise exception 'bonus spin counted towards the day: %', cap; end if;

  -- Third counted spin, then the limit applies although spins remain.
  perform public.record_spin_wheel_result(wheel, user_a, null, seg_none, 'test', 'SPIN-DAAAA4', 'a@example.invalid', 'A');
  begin
    perform public.record_spin_wheel_result(wheel, user_a, null, seg_none, 'test', 'SPIN-DAAAA5', 'a@example.invalid', 'A');
    raise exception 'fourth spin in a day accepted';
  exception when others then
    if sqlerrm not like '%spin_wheel:daily_limit%' then raise; end if;
  end;
  if (select count(*) from public.spin_wheel_entitlements where wheel_id = wheel and auth_user_id = user_a and used_at is null) <> 2 then
    raise exception 'refused spin consumed an entitlement';
  end if;
  cap := public.spin_wheel_daily_capacity(wheel, user_a, 'a@example.invalid');
  if (cap->>'remaining')::integer <> 0 or (cap->>'can_spin_today')::boolean then raise exception 'capacity after limit wrong %', cap; end if;

  -- The same person on a spin link (same email) shares the daily limit.
  insert into public.spin_wheel_passes(wheel_id, token_hash, email, name)
    values (wheel, encode(extensions.digest('pass-daily', 'sha256'), 'hex'), 'a@example.invalid', 'A') returning id into pass_a;
  insert into public.spin_wheel_entitlements (wheel_id, pass_id, source) values (wheel, pass_a, 'admin_grant');
  begin
    perform public.record_spin_wheel_result(wheel, null, pass_a, seg_none, 'test', 'SPIN-DAAAA6', 'a@example.invalid', 'A');
    raise exception 'spin link bypassed the daily limit';
  exception when others then
    if sqlerrm not like '%spin_wheel:daily_limit%' then raise; end if;
  end;
  -- Nor can the spin link win the raffle entry again later: repeat check covers the email.
  if not exists (select 1 from public.spin_wheel_results where wheel_id = wheel and lower(spinner_email) = 'a@example.invalid' and is_prize and prize_name = 'Raffle entry') then
    raise exception 'first win missing';
  end if;

  -- Another person wins the raffle entry normally; a voided win does not count.
  insert into public.spin_wheel_entitlements (wheel_id, auth_user_id, source)
    select wheel, user_b, 'admin_grant' from generate_series(1, 2);
  res := public.record_spin_wheel_result(wheel, user_b, null, seg_raffle, 'test', 'SPIN-DBBBB1', 'b@example.invalid', 'B');
  if (res->>'is_prize')::boolean is not true then raise exception 'second person did not win'; end if;
  update public.spin_wheel_results set voided_at = now(), void_reason = 'test' where reference = 'SPIN-DBBBB1';
  res := public.record_spin_wheel_result(wheel, user_b, null, seg_raffle, 'test', 'SPIN-DBBBB2', 'b@example.invalid', 'B');
  if (res->>'is_prize')::boolean is not true or (res->>'repeat_bonus')::boolean then raise exception 'voided win still blocked the prize'; end if;

  -- A new person starts with the full daily allowance.
  cap := public.spin_wheel_daily_capacity(wheel, null, 'c@example.invalid');
  if (cap->>'remaining')::integer <> 3 then raise exception 'new person capacity wrong %', cap; end if;
end $$;

-- Pending orders need a buyer: use a pass for the unpaid-order capacity check.
do $$
declare wheel uuid; pass_c uuid; ord uuid; cap jsonb;
begin
  select id into wheel from public.spin_wheels where name = 'Daily wheel' and status = 'live';
  insert into public.spin_wheel_passes(wheel_id, token_hash, email, name)
    values (wheel, encode(extensions.digest('pass-c', 'sha256'), 'hex'), 'c@example.invalid', 'C') returning id into pass_c;
  insert into public.orders(customer_name, customer_email, customer_phone, items, total_amount, order_category, order_status, payment_status, payment_reference)
    values ('C', 'c@example.invalid', '', '[]'::jsonb, 10.00, 'spin_wheel', 'submitted', 'pending_bank_transfer', 'NDCCPAY-2026-990102') returning id into ord;
  insert into public.spin_wheel_orders(wheel_id, order_id, pass_id, quantity, unit_price_cents) values (wheel, ord, pass_c, 2, 500);
  cap := public.spin_wheel_daily_capacity(wheel, null, 'C@Example.invalid');
  if (cap->>'pending_spins')::integer <> 2 or (cap->>'remaining')::integer <> 1 then raise exception 'unpaid order not counted %', cap; end if;

  -- Winner receipt copies go to the list the club supplied.
  if (select array_agg(lower(email) order by sort_order) from public.notification_recipients where event_type = 'spin_wheel_winners')
     is distinct from array['ndcc.secretary1@gmail.com', 'ndsc.cricket@gmail.com'] then
    raise exception 'winner receipt copy list not seeded';
  end if;
  if has_function_privilege('anon', 'public.spin_wheel_daily_capacity(uuid,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.spin_wheel_daily_capacity(uuid,uuid,text)', 'execute') then
    raise exception 'browser roles can read daily capacity';
  end if;
end $$;
rollback;
