begin;
alter table public.raffle_orders
 add column cash_received_by_member uuid references public.club_members(id),
 add column cash_handed_in_at timestamptz,
 add column cash_handed_in_by uuid references public.committee_users(id);
create index raffle_orders_cash_member_idx on public.raffle_orders(cash_received_by_member);
create index raffle_orders_cash_handover_staff_idx on public.raffle_orders(cash_handed_in_by);
alter table public.raffle_orders drop constraint raffle_cash_evidence;
alter table public.raffle_orders add constraint raffle_cash_evidence check(
 (payment_method='stripe' and cash_received_by is null and cash_received_by_member is null and cash_received_at is null and cash_sale_key is null)
 or (payment_method='cash' and num_nonnulls(cash_received_by,cash_received_by_member)=1 and cash_received_at is not null and cash_sale_key is not null
 and stripe_payment_intent_id is null and stripe_checkout_session_id is null));
alter table public.raffle_orders add constraint raffle_cash_handover_evidence check(
 (cash_handed_in_at is null and cash_handed_in_by is null)
 or (payment_method='cash' and cash_handed_in_at is not null and cash_handed_in_by is not null));
create or replace function public.raffle_has_payment_evidence(source public.raffle_orders) returns boolean
language sql immutable set search_path='' as $$
 select coalesce((source.payment_method='stripe' and source.stripe_payment_intent_id ~ '^pi_')
 or (source.payment_method='cash' and num_nonnulls(source.cash_received_by,source.cash_received_by_member)=1 and source.cash_received_at is not null
 and source.cash_sale_key is not null and source.stripe_payment_intent_id is null and source.stripe_checkout_session_id is null),false)
$$;
create function public.record_trailer_cash_sale_for_collector(sale_key uuid,actor_id uuid,actor_kind text,buyer_name text,buyer_email text,buyer_phone text,ticket_quantity integer,quoted_price_cents integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.raffle_campaigns%rowtype; o public.raffle_orders%rowtype; n integer; refs jsonb;
begin
 if sale_key is null or actor_id is null then raise exception 'Sale and staff identifiers are required'; end if;
 if actor_kind='member' then
  if not exists(select 1 from public.club_members m join auth.users u on u.id=m.auth_user_id where m.id=actor_id and m.membership_status<>'inactive' and m.privacy_accepted_at is not null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())) then raise exception 'A confirmed club account with saved details is required'; end if;
 elsif actor_kind='staff' then
 if not exists(select 1 from public.committee_users where id=actor_id and is_active and
  (role in ('admin','president','secretary','vice_president','treasurer') or (role='committee' and 'raffle'=any(cms_permissions)))) then raise exception 'Raffle permission is required'; end if;
 else raise exception 'Invalid collector type'; end if;
 if ticket_quantity is null or ticket_quantity not between 1 and 20 or length(trim(coalesce(buyer_name,''))) not between 1 and 120
  or length(coalesce(buyer_email,''))>254 or coalesce(buyer_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or length(coalesce(buyer_phone,''))>40 then raise exception 'Invalid purchaser details or quantity'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-raffle:'||sale_key::text,0));
 select * into o from public.raffle_orders where cash_sale_key=sale_key;
 if found then
  if (case when actor_kind='member' then o.cash_received_by_member else o.cash_received_by end) is distinct from actor_id or o.customer_name<>trim(buyer_name) or o.customer_email<>lower(trim(buyer_email))
   or coalesce(o.customer_phone,'')<>coalesce(trim(buyer_phone),'') or o.quantity<>ticket_quantity or o.amount_cents is distinct from ticket_quantity*quoted_price_cents then
   raise exception 'This sale reference was already used with different details'; end if;
 else
  select * into strict c from public.raffle_campaigns where code='NDCCRAF' for update;
  if actor_kind='member' and not (c.public_visibility_mode='visible' or (c.public_visibility_mode='scheduled' and c.public_opens_at is not null and c.public_opens_at<=now())) then raise exception 'Trailer raffle is not open to members'; end if;
  if not c.active or c.draw_at<=now() then raise exception 'Trailer raffle cash sales are closed'; end if;
  if quoted_price_cents is distinct from c.price_cents then raise exception 'Ticket price changed. Reload before accepting payment'; end if;
  if c.next_ticket_number+ticket_quantity-1>9999 then raise exception 'Trailer raffle ticket allocation exhausted'; end if;
  insert into public.raffle_orders(campaign_id,customer_name,customer_email,customer_phone,quantity,amount_cents,payment_reference,payment_method,cash_received_by,cash_received_by_member,cash_received_at,cash_sale_key)
   values(c.id,trim(buyer_name),lower(trim(buyer_email)),coalesce(trim(buyer_phone),''),ticket_quantity,ticket_quantity*c.price_cents,public.allocate_payment_reference('raffle'),'cash',case when actor_kind='staff' then actor_id end,case when actor_kind='member' then actor_id end,now(),sale_key) returning * into o;
  for n in c.next_ticket_number..c.next_ticket_number+ticket_quantity-1 loop
   insert into public.raffle_tickets(raffle_order_id,campaign_id,ticket_number,ticket_reference) values(o.id,c.id,n,'NDCCTRO-20'||c.year_code||lpad(n::text,4,'0'));
  end loop;
  update public.raffle_campaigns set next_ticket_number=c.next_ticket_number+ticket_quantity,updated_at=now() where id=c.id;
  -- The status trigger atomically queues the existing receipt/ticket delivery job.
  update public.raffle_orders set status='paid',paid_at=now(),updated_at=now() where id=o.id;
 end if;
 select jsonb_agg(ticket_reference order by ticket_number) into refs from public.raffle_tickets where raffle_order_id=o.id;
 return jsonb_build_object('orderId',o.id,'ticketReferences',refs,'amountCents',o.amount_cents,'paymentReference',o.payment_reference);
end $$;
revoke all on function public.record_trailer_cash_sale_for_collector(uuid,uuid,text,text,text,text,integer,integer) from public,anon,authenticated,service_role;
create or replace function public.record_cash_trailer_sale(sale_key uuid,actor_id uuid,buyer_name text,buyer_email text,buyer_phone text,ticket_quantity integer,quoted_price_cents integer)
returns jsonb language sql security definer set search_path='' as $$
 select public.record_trailer_cash_sale_for_collector(sale_key,actor_id,'staff',buyer_name,buyer_email,buyer_phone,ticket_quantity,quoted_price_cents)
$$;
create function public.record_member_cash_trailer_sale(sale_key uuid,actor_id uuid,buyer_name text,buyer_email text,buyer_phone text,ticket_quantity integer,quoted_price_cents integer)
returns jsonb language sql security definer set search_path='' as $$
 select public.record_trailer_cash_sale_for_collector(sale_key,actor_id,'member',buyer_name,buyer_email,buyer_phone,ticket_quantity,quoted_price_cents)
$$;
revoke all on function public.record_member_cash_trailer_sale(uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.record_member_cash_trailer_sale(uuid,uuid,text,text,text,integer,integer) to service_role;
-- Lock the campaign row used by both card and cash allocators. Never renumber tickets.
update public.raffle_campaigns c set next_ticket_number=greatest(c.next_ticket_number,200,
 coalesce((select max(t.ticket_number)+1 from public.raffle_tickets t where t.campaign_id=c.id),200)),updated_at=now()
 where c.code='NDCCRAF';
notify pgrst,'reload schema';
commit;
