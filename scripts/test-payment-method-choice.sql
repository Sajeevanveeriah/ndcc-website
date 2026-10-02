-- Disposable migration-replay database only. All fixtures roll back.
-- orders.payment_method_choice follows the intent columns, an explicit
-- choice wins, pay at the club is allowed on every order category, and the
-- choice never changes the money recorded against an order.
begin;
do $$
declare oid uuid; kid uuid; rec record;
begin
 insert into public.orders(customer_name,customer_email,total_amount,amount_paid,payment_status,order_category,order_status)
 values('Choice fixture',gen_random_uuid()||'@example.invalid',40,0,'pending_bank_transfer','merch','submitted') returning id into oid;
 if (select payment_method_choice from public.orders where id=oid) is not null then raise exception 'New order without intent has a choice'; end if;

 -- Pay at the club is no longer kitchen only.
 update public.orders set bar_payment_selected_at=now() where id=oid;
 select * into rec from public.orders where id=oid;
 if rec.payment_method_choice is distinct from 'pay_at_club' or rec.payment_method_choice_source is distinct from 'purchaser' or rec.payment_method_choice_at is null then raise exception 'Pay at club intent not recorded: %', rec.payment_method_choice; end if;
 if rec.amount_paid<>0 or rec.payment_status<>'pending_bank_transfer' then raise exception 'Choice changed money or status'; end if;

 -- Switching to a bank deposit (the bank route clears the club choice).
 update public.orders set bank_transfer_selected_at=now(), bar_payment_selected_at=null where id=oid;
 if (select payment_method_choice from public.orders where id=oid) is distinct from 'bank_transfer' then raise exception 'Bank intent not recorded'; end if;

 -- Removing the intent removes the choice it created.
 update public.orders set bank_transfer_selected_at=null where id=oid;
 if (select payment_method_choice from public.orders where id=oid) is not null then raise exception 'Cleared intent left a choice'; end if;

 -- A card checkout sets the choice explicitly; clearing a bank tick keeps it.
 update public.orders set bank_transfer_selected_at=now() where id=oid;
 update public.orders set payment_method_choice='stripe', payment_method_choice_source='purchaser' where id=oid;
 update public.orders set bank_transfer_selected_at=null where id=oid;
 if (select payment_method_choice from public.orders where id=oid) is distinct from 'stripe' then raise exception 'Card choice lost when bank tick cleared'; end if;

 -- An administrator's explicit choice wins over the intent columns in the same statement.
 update public.orders set payment_method_choice='pay_at_club', payment_method_choice_source='admin', payment_method_choice_by='admin@example.invalid', bar_payment_selected_at=now(), bank_transfer_selected_at=null where id=oid;
 select * into rec from public.orders where id=oid;
 if rec.payment_method_choice<>'pay_at_club' or rec.payment_method_choice_source<>'admin' or rec.payment_method_choice_by<>'admin@example.invalid' then raise exception 'Admin choice not kept'; end if;

 -- Clearing the choice clears its audit fields.
 update public.orders set payment_method_choice=null where id=oid;
 select * into rec from public.orders where id=oid;
 if rec.payment_method_choice_at is not null or rec.payment_method_choice_source is not null or rec.payment_method_choice_by is not null then raise exception 'Cleared choice kept audit fields'; end if;

 -- Unknown methods are refused.
 begin
  update public.orders set payment_method_choice='cheque' where id=oid;
  raise exception 'Unknown method accepted';
 exception when check_violation then null; end;

 -- Insert with intent already set (kitchen bar choice at creation).
 insert into public.orders(customer_name,customer_email,total_amount,amount_paid,payment_status,order_category,order_status,bar_payment_selected_at)
 values('Kitchen fixture',gen_random_uuid()||'@example.invalid',18,0,'pending_bank_transfer','kitchen','submitted',now()) returning id into kid;
 if (select payment_method_choice from public.orders where id=kid) is distinct from 'pay_at_club' then raise exception 'Insert intent not recorded'; end if;

 if not exists(select 1 from public.merch_payment_settings where pay_at_club_enabled) then raise exception 'Pay at club switch missing or off by default'; end if;
end $$;
rollback;
