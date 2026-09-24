begin;
alter table public.raffle_orders
 add column payment_method text not null default 'stripe' check(payment_method in ('stripe','cash')),
 add column cash_received_by uuid references public.committee_users(id),
 add column cash_received_at timestamptz,
 add column cash_sale_key uuid unique;
alter table public.raffle_orders add constraint raffle_cash_evidence check(
 (payment_method='stripe' and cash_received_by is null and cash_received_at is null and cash_sale_key is null)
 or (payment_method='cash' and cash_received_by is not null and cash_received_at is not null and cash_sale_key is not null
 and stripe_payment_intent_id is null and stripe_checkout_session_id is null));
create index raffle_orders_cash_received_by_idx on public.raffle_orders(cash_received_by);
-- Campaign/payment references stay stable. Only newly issued trailer TICKET
-- references change; old tickets and the reverse raffle are preserved.
alter table public.raffle_tickets drop constraint raffle_tickets_ticket_reference_check;
alter table public.raffle_tickets add constraint raffle_tickets_ticket_reference_check check(
 ticket_reference ~ '^NDCCRAF-[0-9]{6}$' or ticket_reference ~ '^NDCCTRO-[0-9]{8}$' or ticket_reference ~ '^NDCCRRO-2026[0-9]{4}$');
create function public.format_new_trailer_ticket() returns trigger language plpgsql set search_path='' as $$
declare c public.raffle_campaigns%rowtype;
begin
 select * into strict c from public.raffle_campaigns where id=new.campaign_id;
 if c.code='NDCCRAF' then new.ticket_reference:='NDCCTRO-'||'20'||c.year_code||lpad(new.ticket_number::text,4,'0'); end if;
 return new;
end $$;
revoke all on function public.format_new_trailer_ticket() from public,anon,authenticated;
create trigger format_new_trailer_ticket before insert on public.raffle_tickets for each row execute function public.format_new_trailer_ticket();

create function public.raffle_has_payment_evidence(source public.raffle_orders) returns boolean
language sql immutable set search_path='' as $$
 select coalesce((source.payment_method='stripe' and source.stripe_payment_intent_id ~ '^pi_')
 or (source.payment_method='cash' and source.cash_received_by is not null and source.cash_received_at is not null
 and source.cash_sale_key is not null and source.stripe_payment_intent_id is null and source.stripe_checkout_session_id is null),false)
$$;
revoke all on function public.raffle_has_payment_evidence(public.raffle_orders) from public,anon,authenticated;
grant execute on function public.raffle_has_payment_evidence(public.raffle_orders) to service_role;

-- Extend the existing leased receipt outbox, preserving every other domain's
-- financial checks. Assert each exact edit before replacing the stored function.
do $patch$
declare signature text; definition text; patched text; needle text;
begin
 foreach signature in array array[
  'public.enqueue_payment_receipt_job(text,uuid,timestamp with time zone)',
  'public.claim_payment_receipt_job(uuid,uuid,integer)',
  'public.preflight_payment_receipt_job(uuid,uuid)',
  'public.requeue_payment_receipt_job(uuid)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if signature like '%requeue_%' then
   needle:=E'and stripe_payment_intent_id ~ ''^pi_''\n        and payment_reference ~ ''^NDCCRAF-[0-9]{4}-[0-9]{6}$''';
   patched:=replace(definition,needle,E'and public.raffle_has_payment_evidence(raffle_orders)\n        and payment_reference ~ ''^NDCCRAF-[0-9]{4}-[0-9]{6}$''');
  else
   patched:=regexp_replace(definition,
    'source.stripe_payment_intent_id = source_payment_intent\s+and source_payment_intent ~ ''\^pi_''(\s+and source.payment_reference ~ ''\^NDCCRAF-)',
    E'public.raffle_has_payment_evidence(source)\\1','g');
  end if;
  if patched=definition then raise exception 'Receipt payment predicate not found: %',signature; end if;
  execute patched;
 end loop;
end $patch$;

create function public.record_cash_trailer_sale(sale_key uuid,actor_id uuid,buyer_name text,buyer_email text,buyer_phone text,ticket_quantity integer,quoted_price_cents integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.raffle_campaigns%rowtype; o public.raffle_orders%rowtype; n integer; refs jsonb;
begin
 if sale_key is null or actor_id is null then raise exception 'Sale and staff identifiers are required'; end if;
 if not exists(select 1 from public.committee_users where id=actor_id and is_active and
  (role in ('admin','president','secretary','vice_president','treasurer') or (role='committee' and 'raffle'=any(cms_permissions)))) then raise exception 'Raffle permission is required'; end if;
 if ticket_quantity is null or ticket_quantity not between 1 and 20 or length(trim(coalesce(buyer_name,''))) not between 1 and 120
  or length(coalesce(buyer_email,''))>254 or coalesce(buyer_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or length(coalesce(buyer_phone,''))>40 then raise exception 'Invalid purchaser details or quantity'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-raffle:'||sale_key::text,0));
 select * into o from public.raffle_orders where cash_sale_key=sale_key;
 if found then
  if o.cash_received_by<>actor_id or o.customer_name<>trim(buyer_name) or o.customer_email<>lower(trim(buyer_email))
   or coalesce(o.customer_phone,'')<>coalesce(trim(buyer_phone),'') or o.quantity<>ticket_quantity or o.amount_cents is distinct from ticket_quantity*quoted_price_cents then
   raise exception 'This sale reference was already used with different details'; end if;
 else
  select * into strict c from public.raffle_campaigns where code='NDCCRAF' for update;
  if not c.active or c.draw_at<=now() then raise exception 'Trailer raffle cash sales are closed'; end if;
  if quoted_price_cents is distinct from c.price_cents then raise exception 'Ticket price changed. Reload before accepting payment'; end if;
  if c.next_ticket_number+ticket_quantity-1>9999 then raise exception 'Trailer raffle ticket allocation exhausted'; end if;
  insert into public.raffle_orders(campaign_id,customer_name,customer_email,customer_phone,quantity,amount_cents,payment_reference,payment_method,cash_received_by,cash_received_at,cash_sale_key)
   values(c.id,trim(buyer_name),lower(trim(buyer_email)),coalesce(trim(buyer_phone),''),ticket_quantity,ticket_quantity*c.price_cents,public.allocate_payment_reference('raffle'),'cash',actor_id,now(),sale_key) returning * into o;
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
revoke all on function public.record_cash_trailer_sale(uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.record_cash_trailer_sale(uuid,uuid,text,text,text,integer,integer) to service_role;
notify pgrst,'reload schema';
commit;
