begin;
do $$
declare claimed public.apparel_balance_reminders; n integer; test_id uuid;
begin
  -- This file runs only in the disposable full-replay database and rolls back.
  delete from public.apparel_balance_reminders;
  update public.orders set deleted_at=now() where order_category='merch';
  insert into public.orders(customer_name,customer_email,total_amount,amount_paid,payment_status,order_category,created_at,order_status)
  select 'Reminder test','test@example.invalid',100,case when status='part_paid' then 20 else 0 end,status,'merch',now()-interval '43 days','submitted'
  from unnest(array['part_paid','unpaid','pending','pending_bank_transfer']) status;
  insert into public.orders(customer_name,customer_email,total_amount,amount_paid,payment_status,order_category,created_at,order_status)
  values ('Recent','test@example.invalid',100,0,'unpaid','merch',now()-interval '20 days','submitted'),
         ('Paid','test@example.invalid',100,100,'paid','merch',now()-interval '43 days','submitted'),
         ('Cancelled','test@example.invalid',100,0,'unpaid','merch',now()-interval '43 days','cancelled'),
         ('Refunded','test@example.invalid',100,0,'refunded','merch',now()-interval '43 days','submitted');
  for n in 1..4 loop
    select * into claimed from public.claim_apparel_balance_reminder();
    if claimed.id is null then raise exception 'Expected four due reminders'; end if;
    if claimed.cycle<>2 then raise exception 'Only current cycle should be queued'; end if;
    if not exists(select 1 from public.apparel_balance_links where order_id=claimed.order_id) then raise exception 'Missing payment link'; end if;
    update public.apparel_balance_reminders set status='sent',sent_at=now(),lease_until=null where id=claimed.id;
  end loop;
  if exists(select 1 from public.claim_apparel_balance_reminder()) then raise exception 'Repeated worker duplicated a reminder'; end if;
  if (select count(*) from public.apparel_balance_reminders)<>4 then raise exception 'Ineligible order queued'; end if;
  -- A settled order is cancelled before it can be claimed.
  select id into test_id from public.orders where customer_name='Reminder test' and payment_status='unpaid';
  update public.apparel_balance_reminders set status='queued',lease_until=null where order_id=test_id;
  update public.orders set amount_paid=100,payment_status='paid' where id=test_id;
  perform public.claim_apparel_balance_reminder();
  if not exists(select 1 from public.apparel_balance_reminders where order_id=test_id and status='cancelled') then raise exception 'Settled reminder not cancelled'; end if;
  if has_function_privilege('anon','public.claim_apparel_balance_reminder()','execute') or has_function_privilege('authenticated','public.claim_apparel_balance_reminder()','execute') then raise exception 'Public reminder worker access'; end if;
end $$;
rollback;
