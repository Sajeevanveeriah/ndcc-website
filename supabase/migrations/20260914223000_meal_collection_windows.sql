-- Additive: historical orders retain NULL collection and service-date values.
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  customer_phone TEXT DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status TEXT DEFAULT 'pending',
  stripe_session_id TEXT,
  processed BOOLEAN DEFAULT FALSE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  order_status TEXT DEFAULT 'submitted',
  payment_reference TEXT,
  bank_reference_used TEXT,
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  needs_review_reason TEXT DEFAULT '',
  order_category TEXT DEFAULT 'general',
  merch_window_id UUID,
  merch_window_label TEXT
);

alter table public.orders
  add column meal_collection_window text check (meal_collection_window in ('juniors', 'seniors')),
  add column meal_service_date date check (extract(isodow from meal_service_date) = 4),
  add column meal_draft_token uuid unique,
  add column meal_revision integer not null default 0,
  add column meal_editing boolean not null default false,
  add column meal_request jsonb;
alter table public.kitchen_orders
  add column meal_collection_window text check (meal_collection_window in ('juniors', 'seniors')),
  add column meal_service_date date check (extract(isodow from meal_service_date) = 4);

-- Only the existing trusted server may call these RPCs. The bearer draft token
-- is generated with crypto.randomUUID(), never an order reference or user name.
create function public.save_meal_order(target_token uuid, target_revision integer,
  target_request jsonb, target_reference text, target_service_date date)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.orders%rowtype; k uuid; r jsonb; total numeric;
begin
  if target_token is null or target_request->>'collection_window' is null
    or target_request->>'collection_window' not in ('juniors','seniors')
    or target_service_date is null or extract(isodow from target_service_date) <> 4 then
    raise exception 'Invalid meal collection selection';
  end if;
  -- Serialise first submissions as well as updates and lost-response retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_token::text, 0));
  select * into o from public.orders where meal_draft_token=target_token for update;
  if found and o.meal_request=target_request and not o.meal_editing then
    return pg_catalog.to_jsonb(o);
  end if;
  if o.id is not null then
    if o.meal_revision <> target_revision or not o.meal_editing
      or o.amount_paid <> 0 or o.payment_status='paid'
      or exists(select 1 from public.order_payments where order_id=o.id and status in ('pending','settled')) then
      raise exception 'Order changed or payment is pending. Refresh before editing.';
    end if;
    if o.meal_service_date <> target_service_date then
      raise exception 'This order belongs to an earlier service. Contact the club.';
    end if;
  end if;
  select sum((v->>'price')::numeric*(v->>'quantity')::integer) into total
    from pg_catalog.jsonb_array_elements(target_request->'items') v;
  if total is null or total<=0 then raise exception 'Invalid meal total'; end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',v->>'name','size','kitchen',
    'quantity',(v->>'quantity')::integer,'price',(v->>'price')::numeric)) into r
    from pg_catalog.jsonb_array_elements(target_request->'items') v;
  if o.id is null then
    insert into public.orders(customer_name,customer_email,customer_phone,items,total_amount,
      payment_status,payment_reference,order_category,order_status,processed,notes,
      meal_collection_window,meal_service_date,meal_draft_token,meal_revision,meal_request)
    values(target_request->>'name',target_request->>'email',target_request->>'phone',r,total,
      'pending_bank_transfer',target_reference,'kitchen','submitted',false,'Kitchen order',
      target_request->>'collection_window',target_service_date,target_token,1,target_request)
    returning * into o;
    insert into public.kitchen_orders(customer_name,total_amount,status,payment_status,payment_reference,
      linked_order_id,processed,meal_collection_window,meal_service_date)
    values(o.customer_name,total,'submitted','pending_bank_transfer',o.payment_reference,o.id,false,
      o.meal_collection_window,o.meal_service_date) returning id into k;
  else
    update public.orders set customer_name=target_request->>'name',customer_email=target_request->>'email',
      customer_phone=target_request->>'phone',items=r,total_amount=total,
      meal_collection_window=target_request->>'collection_window',meal_revision=meal_revision+1,
      meal_request=target_request,meal_editing=false,stripe_session_id=null
      where id=o.id returning * into o;
    update public.kitchen_orders set customer_name=o.customer_name,total_amount=total,
      meal_collection_window=o.meal_collection_window,meal_service_date=o.meal_service_date
      where linked_order_id=o.id returning id into k;
    if k is null then raise exception 'Kitchen order link missing'; end if;
    delete from public.kitchen_order_items where order_id=k;
  end if;
  insert into public.kitchen_order_items(order_id,item_id,quantity,price)
    select k,(v->>'item_id')::uuid,(v->>'quantity')::integer,(v->>'price')::numeric
    from pg_catalog.jsonb_array_elements(target_request->'items') v;
  return pg_catalog.to_jsonb(o);
end; $$;

create function public.begin_meal_order_edit(target_token uuid, target_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where meal_draft_token=target_token for update;
  if not found then raise exception 'Order not found'; end if;
  if o.meal_revision<>target_revision or o.amount_paid<>0 or o.payment_status='paid'
    or exists(select 1 from public.order_payments where order_id=o.id and status in ('pending','settled')) then
    raise exception 'Payment is pending or the order changed. Refresh before editing.';
  end if;
  update public.orders set meal_editing=true where id=o.id returning * into o;
  return pg_catalog.to_jsonb(o);
end; $$;

-- Share the existing order lock and reservation/ledger behaviour. This closes
-- the race between an edit in one tab and starting Checkout in another tab.
create function public.reserve_meal_stripe_payment(target_order_id uuid, target_token uuid,
  target_revision integer, target_payment_reference text, target_amount_cents integer,
  target_payment_kind text, target_checkout_origin text, target_return_path text)
returns table(payment_id uuid,available_balance_cents integer,checkout_expires_at_unix bigint)
language plpgsql security invoker set search_path = '' as $$
declare o public.orders%rowtype; r record;
begin
  select * into o from public.orders where id=target_order_id for update;
  if not found or o.order_category<>'kitchen' or o.meal_draft_token is distinct from target_token
    or o.meal_revision is distinct from target_revision or o.meal_editing
    or o.meal_collection_window is null or o.meal_service_date is null then
    raise exception 'Please choose a meal collection time before continuing to payment.';
  end if;
  select * into strict r from public.reserve_order_stripe_payment_v2(target_order_id,
    target_payment_reference,target_amount_cents,target_payment_kind,target_checkout_origin,target_return_path);
  update public.order_payments set metadata=metadata||pg_catalog.jsonb_build_object(
    'meal_collection_window',o.meal_collection_window,'meal_service_date',o.meal_service_date::text,
    'meal_revision',o.meal_revision::text,'meal_time_zone','Australia/Melbourne') where id=r.payment_id;
  return query select r.payment_id::uuid,r.available_balance_cents::integer,r.checkout_expires_at_unix::bigint;
end; $$;

revoke all on function public.save_meal_order(uuid,integer,jsonb,text,date) from public,anon,authenticated;
revoke all on function public.begin_meal_order_edit(uuid,integer) from public,anon,authenticated;
revoke all on function public.reserve_meal_stripe_payment(uuid,uuid,integer,text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.save_meal_order(uuid,integer,jsonb,text,date) to service_role;
grant execute on function public.begin_meal_order_edit(uuid,integer) to service_role;
grant execute on function public.reserve_meal_stripe_payment(uuid,uuid,integer,text,integer,text,text,text) to service_role;
