-- Paid-only raffle ticket allocation and configurable kitchen ordering defaults.
create table if not exists public.raffle_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique check (code ~ '^[A-Z0-9]+$'),
  year_code text not null check (year_code ~ '^[0-9]{2}$'),
  price_cents integer not null check (price_cents > 0),
  draw_at timestamptz not null,
  draw_label text not null,
  active boolean not null default true,
  next_ticket_number integer not null default 1 check (next_ticket_number between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists raffle_campaigns_one_active on public.raffle_campaigns (active) where active;

create table if not exists public.raffle_orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.raffle_campaigns(id),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  quantity integer not null check (quantity between 1 and 20),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'aud' check (currency = 'aud'),
  status text not null default 'pending_payment' check (status in ('pending_payment','paid','cancelled','refunded')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  customer_email_sent_at timestamptz,
  staff_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists raffle_orders_campaign_id_idx on public.raffle_orders(campaign_id);
create index if not exists raffle_orders_customer_email_idx on public.raffle_orders(customer_email);

create table if not exists public.raffle_tickets (
  id uuid primary key default gen_random_uuid(),
  raffle_order_id uuid not null references public.raffle_orders(id) on delete cascade,
  campaign_id uuid not null references public.raffle_campaigns(id),
  ticket_number integer not null check (ticket_number between 1 and 9999),
  ticket_reference text not null unique check (ticket_reference ~ '^NDCCRAF-26[0-9]{4}$'),
  issued_at timestamptz not null default now(),
  unique (campaign_id, ticket_number)
);
create index if not exists raffle_tickets_order_id_idx on public.raffle_tickets(raffle_order_id);

create table if not exists public.raffle_payment_events (
  provider_event_id text primary key,
  raffle_order_id uuid not null references public.raffle_orders(id),
  event_type text not null,
  created_at timestamptz not null default now()
);
create index if not exists raffle_payment_events_order_id_idx on public.raffle_payment_events(raffle_order_id);

insert into public.raffle_campaigns (name, code, year_code, price_cents, draw_at, draw_label)
values ('Dinos Trailer Raffle', 'NDCCRAF', '26', 500, '2026-12-19 19:00:00+11', 'Christmas Party - 19 December 2026')
on conflict (code) do update set price_cents = excluded.price_cents, draw_at = excluded.draw_at, draw_label = excluded.draw_label, active = true;

create or replace function public.issue_paid_raffle_tickets(
  target_order_id uuid, target_provider_event_id text, target_session_id text, target_payment_intent_id text
) returns table(ticket_reference text, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare o public.raffle_orders%rowtype; c public.raffle_campaigns%rowtype; start_no integer; i integer;
begin
  if exists (select 1 from public.raffle_payment_events where provider_event_id = target_provider_event_id) then
    return query select t.ticket_reference, true from public.raffle_tickets t where t.raffle_order_id = target_order_id order by t.ticket_number;
    return;
  end if;
  select * into o from public.raffle_orders where id = target_order_id for update;
  if not found then raise exception 'Raffle order not found'; end if;
  select * into c from public.raffle_campaigns where id = o.campaign_id for update;
  if c.next_ticket_number + o.quantity - 1 > 9999 then raise exception 'Raffle ticket allocation exhausted'; end if;
  insert into public.raffle_payment_events(provider_event_id, raffle_order_id, event_type) values(target_provider_event_id, o.id, 'paid');
  if o.status = 'paid' then
    return query select t.ticket_reference, true from public.raffle_tickets t where t.raffle_order_id = o.id order by t.ticket_number;
    return;
  end if;
  start_no := c.next_ticket_number;
  for i in 0..o.quantity-1 loop
    insert into public.raffle_tickets(raffle_order_id,campaign_id,ticket_number,ticket_reference)
    values(o.id,c.id,start_no+i,c.code||'-'||c.year_code||lpad((start_no+i)::text,4,'0'));
  end loop;
  update public.raffle_campaigns set next_ticket_number = start_no + o.quantity, updated_at = now() where id = c.id;
  update public.raffle_orders set status='paid', stripe_checkout_session_id=target_session_id,
    stripe_payment_intent_id=target_payment_intent_id, paid_at=now(), updated_at=now() where id=o.id;
  return query select t.ticket_reference, false from public.raffle_tickets t where t.raffle_order_id = o.id order by t.ticket_number;
end $$;

alter table public.raffle_campaigns enable row level security;
alter table public.raffle_orders enable row level security;
alter table public.raffle_tickets enable row level security;
alter table public.raffle_payment_events enable row level security;
revoke all on function public.issue_paid_raffle_tickets(uuid,text,text,text) from public, anon, authenticated;
notify pgrst, 'reload schema';
