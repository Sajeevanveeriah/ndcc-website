-- Dinos Prize Wheel: a VGCCC "small raffle" drawn live at the clubrooms by
-- spinning wheel. Nothing is spun online; the website sells numbered tickets
-- inside a short sales window and records the live draw.
--
-- Small raffle conditions mirrored here (and in lib/prize-wheel/rules.ts):
--   * total prize value <= $500 (prize_pool_cents <= 50000)
--   * all wheel raffles drawn on the same Melbourne date total <= $1,000
--   * first sale and the draw within 8 hours (draw_at - sales_open_at <= 8h)
--   * total ticket value (price x wheel divisions) between 2x and 6x prizes
--   * no more numbers than wheel divisions (tickets numbered 1..divisions)
--   * first draw wins first prize; unsold/unclaimed numbers are re-spun
--   * draw records are append-only and retained
--
-- Wheel campaigns reuse raffle_campaigns, raffle_orders and raffle_tickets.
-- Payment references stay in the existing raffle category (NDCCRAF-YYYY-NNNNNN)
-- so allocate_payment_reference, Stripe metadata, the webhook and the receipt
-- outbox are unchanged. Wheel TICKET references are NDCCWHL-YYMMDDL-NNN, where
-- the campaign code is NDCCWHL + Melbourne draw date (YYMMDD) + a letter.
--
-- Rollback (safe only while no wheel campaign has orders or draws; never delete
-- issued tickets or draw records - they are retained for 3 years):
--   begin;
--   drop function public.save_wheel_campaign(jsonb,uuid);
--   drop function public.record_wheel_draw(uuid,uuid,integer,text,uuid,text);
--   drop function public.record_wheel_prize_collection(uuid,uuid,text);
--   drop function public.record_wheel_winner_email(uuid,uuid);
--   drop function public.record_wheel_cash_sale(uuid,uuid,uuid,text,text,text,integer[],integer);
--   drop function public.wheel_raffle_unavailable_numbers(uuid);
--   drop table public.raffle_wheel_winner_emails, public.raffle_wheel_collections, public.raffle_draws;
--   drop trigger assign_wheel_ticket_number on public.raffle_tickets;
--   drop trigger guard_wheel_ticket_update on public.raffle_tickets;
--   drop trigger reserve_wheel_raffle_selection on public.raffle_orders;
--   drop trigger guard_wheel_raffle_order on public.raffle_orders;
--   drop trigger guard_wheel_campaign on public.raffle_campaigns;
--   drop trigger check_wheel_campaign_prize_pool on public.raffle_campaigns;
--   drop table public.raffle_wheel_prizes;
--   drop function public.assign_wheel_ticket_number(), public.guard_wheel_ticket_update(),
--     public.reserve_wheel_raffle_selection(), public.guard_wheel_raffle_order(),
--     public.guard_wheel_campaign(), public.check_wheel_prize_pool(),
--     public.guard_wheel_prizes(), public.reject_raffle_wheel_record_change(),
--     public.is_raffle_operator(uuid);
--   alter table public.raffle_tickets drop constraint raffle_tickets_ticket_reference_check;
--   alter table public.raffle_tickets add constraint raffle_tickets_ticket_reference_check check(
--     ticket_reference ~ '^NDCCRAF-[0-9]{6}$' or ticket_reference ~ '^NDCCTRO-[0-9]{8}$' or ticket_reference ~ '^NDCCRRO-2026[0-9]{4}$');
--   alter table public.raffle_campaigns drop constraint raffle_campaigns_wheel_rules,
--     drop constraint raffle_campaigns_kind_check, drop column kind, drop column wheel_divisions,
--     drop column sales_open_at, drop column prize_pool_cents;
--   notify pgrst,'reload schema';
--   commit;
begin;
set local lock_timeout = '3s';

alter table public.raffle_campaigns
  add column kind text not null default 'standard',
  add column wheel_divisions integer,
  add column sales_open_at timestamptz,
  add column prize_pool_cents integer;
alter table public.raffle_campaigns add constraint raffle_campaigns_kind_check
  check (kind in ('standard', 'wheel'));
alter table public.raffle_campaigns add constraint raffle_campaigns_wheel_rules check (
  (kind = 'standard' and wheel_divisions is null and sales_open_at is null
    and prize_pool_cents is null and code !~ '^NDCCWHL')
  or (kind = 'wheel'
    and code ~ '^NDCCWHL[0-9]{6}[A-Z]$'
    and year_code ~ '^[0-9]{2}$'
    and wheel_divisions between 2 and 100
    and sales_open_at is not null
    and draw_at is not null
    and draw_at > sales_open_at
    and draw_at - sales_open_at <= interval '8 hours'
    and prize_pool_cents between 1 and 50000
    and price_cents::bigint * wheel_divisions between 2::bigint * prize_pool_cents and 6::bigint * prize_pool_cents
    and length(trim(coalesce(draw_label, ''))) between 1 and 200)
);
comment on column public.raffle_campaigns.kind is 'standard raffle or wheel (VGCCC small raffle drawn by spinning wheel at the clubrooms).';

alter table public.raffle_tickets drop constraint raffle_tickets_ticket_reference_check;
alter table public.raffle_tickets add constraint raffle_tickets_ticket_reference_check check(
  ticket_reference ~ '^NDCCRAF-[0-9]{6}$' or ticket_reference ~ '^NDCCTRO-[0-9]{8}$'
  or ticket_reference ~ '^NDCCRRO-2026[0-9]{4}$' or ticket_reference ~ '^NDCCWHL-[0-9]{6}[A-Z]-[0-9]{3}$');

-- Same authority as the existing staff cash-sale allocator.
create function public.is_raffle_operator(actor_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.committee_users where id = actor_id and is_active and
    (role in ('admin','president','secretary','vice_president','treasurer')
      or (role = 'committee' and 'raffle' = any(cms_permissions))))
$$;
revoke all on function public.is_raffle_operator(uuid) from public, anon, authenticated;
grant execute on function public.is_raffle_operator(uuid) to service_role;

create table public.raffle_wheel_prizes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.raffle_campaigns(id),
  position integer not null check (position between 1 and 100),
  name text not null check (length(trim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 500),
  retail_value_cents integer not null check (retail_value_cents between 1 and 50000),
  quantity integer not null default 1 check (quantity between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, position)
);
comment on table public.raffle_wheel_prizes is 'Prize wheel prizes, drawn in position order. One winner receives all quantity items; prize value is retail_value_cents x quantity.';

create table public.raffle_draws (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.raffle_campaigns(id),
  prize_id uuid not null references public.raffle_wheel_prizes(id),
  draw_number integer not null check (draw_number between 1 and 10000),
  winning_number integer not null check (winning_number between 1 and 100),
  ticket_id uuid references public.raffle_tickets(id),
  random_value text not null check (length(random_value) between 1 and 200),
  operator_id uuid not null references public.committee_users(id),
  respin_reason text check (respin_reason in ('unsold', 'unclaimed', 'already_won')),
  created_at timestamptz not null default now(),
  unique (campaign_id, draw_number)
);
comment on table public.raffle_draws is 'Append-only live draw log. respin_reason explains why this spin replaced the previous spin for the same prize. Retain for 3 years.';
comment on column public.raffle_draws.ticket_id is 'Paid, unvoided ticket holding winning_number that had not already won; null when unsold or already a winner.';
-- A ticket can win only once.
create unique index raffle_draws_ticket_wins_once on public.raffle_draws(ticket_id) where ticket_id is not null;
create index raffle_draws_prize_idx on public.raffle_draws(prize_id, draw_number);
create index raffle_draws_operator_idx on public.raffle_draws(operator_id);

create table public.raffle_wheel_collections (
  draw_id uuid primary key references public.raffle_draws(id),
  collected_at timestamptz not null default now(),
  recorded_by uuid not null references public.committee_users(id),
  note text check (note is null or length(note) <= 300)
);
create index raffle_wheel_collections_recorded_by_idx on public.raffle_wheel_collections(recorded_by);

create table public.raffle_wheel_winner_emails (
  draw_id uuid primary key references public.raffle_draws(id),
  sent_at timestamptz not null default now(),
  sent_by uuid not null references public.committee_users(id)
);
create index raffle_wheel_winner_emails_sent_by_idx on public.raffle_wheel_winner_emails(sent_by);

alter table public.raffle_wheel_prizes enable row level security;
alter table public.raffle_draws enable row level security;
alter table public.raffle_wheel_collections enable row level security;
alter table public.raffle_wheel_winner_emails enable row level security;
revoke all on public.raffle_wheel_prizes, public.raffle_draws, public.raffle_wheel_collections,
  public.raffle_wheel_winner_emails from public, anon, authenticated;
grant select, insert, update, delete on public.raffle_wheel_prizes to service_role;
-- Draw evidence is insert-only, even for the service role.
revoke update, delete, truncate on public.raffle_draws, public.raffle_wheel_collections,
  public.raffle_wheel_winner_emails from service_role;
grant select, insert on public.raffle_draws, public.raffle_wheel_collections,
  public.raffle_wheel_winner_emails to service_role;

create function public.reject_raffle_wheel_record_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Prize wheel draw records are append-only and must be retained.';
end $$;
revoke all on function public.reject_raffle_wheel_record_change() from public, anon, authenticated;
create trigger raffle_draws_append_only before update or delete on public.raffle_draws
  for each row execute function public.reject_raffle_wheel_record_change();
create trigger raffle_draws_no_truncate before truncate on public.raffle_draws
  for each statement execute function public.reject_raffle_wheel_record_change();
create trigger raffle_wheel_collections_append_only before update or delete on public.raffle_wheel_collections
  for each row execute function public.reject_raffle_wheel_record_change();
create trigger raffle_wheel_collections_no_truncate before truncate on public.raffle_wheel_collections
  for each statement execute function public.reject_raffle_wheel_record_change();
create trigger raffle_wheel_winner_emails_append_only before update or delete on public.raffle_wheel_winner_emails
  for each row execute function public.reject_raffle_wheel_record_change();
create trigger raffle_wheel_winner_emails_no_truncate before truncate on public.raffle_wheel_winner_emails
  for each statement execute function public.reject_raffle_wheel_record_change();

-- Prize totals are checked at commit so a campaign and its prizes can be
-- saved together in one transaction.
create function public.check_wheel_prize_pool() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid; c public.raffle_campaigns%rowtype; total bigint; prize_count integer;
begin
  if tg_table_name = 'raffle_wheel_prizes' then
    target := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  else
    target := new.id;
  end if;
  select * into c from public.raffle_campaigns where id = target;
  select coalesce(sum(retail_value_cents::bigint * quantity), 0), count(*) into total, prize_count
    from public.raffle_wheel_prizes where campaign_id = target;
  if c.id is null or c.kind is distinct from 'wheel' then
    if prize_count > 0 then raise exception 'Prizes can only belong to a prize wheel campaign.'; end if;
    return null;
  end if;
  if prize_count < 1 or prize_count > c.wheel_divisions then
    raise exception 'A prize wheel needs between 1 prize and one prize per wheel division.';
  end if;
  if total > 50000 or total <> c.prize_pool_cents then
    raise exception 'Prize wheel prizes must total the declared prize pool (maximum $500).';
  end if;
  return null;
end $$;
revoke all on function public.check_wheel_prize_pool() from public, anon, authenticated;
create constraint trigger check_wheel_prize_pool after insert or update or delete on public.raffle_wheel_prizes
  deferrable initially deferred for each row execute function public.check_wheel_prize_pool();
create constraint trigger check_wheel_campaign_prize_pool after insert or update on public.raffle_campaigns
  deferrable initially deferred for each row when (new.kind = 'wheel')
  execute function public.check_wheel_prize_pool();

-- Prizes are fixed once any sale or checkout exists, and never move campaign.
create function public.guard_wheel_prizes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if tg_op = 'UPDATE' and new.campaign_id is distinct from old.campaign_id then
    raise exception 'Prize wheel prizes cannot move between campaigns.';
  end if;
  target := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  if exists(select 1 from public.raffle_orders where campaign_id = target and status <> 'cancelled')
    or exists(select 1 from public.raffle_draws where campaign_id = target) then
    raise exception 'Prize wheel prizes are locked once sales begin.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.guard_wheel_prizes() from public, anon, authenticated;
create trigger guard_wheel_prizes before insert or update or delete on public.raffle_wheel_prizes
  for each row execute function public.guard_wheel_prizes();

-- Wheel configuration is fixed once sales begin, and all wheel raffles drawn
-- on one Melbourne date may not exceed $1,000 in prizes.
create function public.guard_wheel_campaign() returns trigger
language plpgsql security definer set search_path = '' as $$
declare draw_day date; day_total bigint;
begin
  if tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind or (old.kind = 'wheel' and new.code is distinct from old.code) then
      raise exception 'A raffle campaign cannot change kind or wheel code.';
    end if;
    if old.kind = 'wheel'
      and (new.price_cents, new.wheel_divisions, new.sales_open_at, new.draw_at, new.prize_pool_cents, new.year_code)
        is distinct from (old.price_cents, old.wheel_divisions, old.sales_open_at, old.draw_at, old.prize_pool_cents, old.year_code)
      and (exists(select 1 from public.raffle_orders where campaign_id = old.id and status <> 'cancelled')
        or exists(select 1 from public.raffle_draws where campaign_id = old.id)) then
      raise exception 'Prize wheel price, numbers, prizes and times are locked once sales begin.';
    end if;
  end if;
  -- Only re-check the daily limit when it can change, so ticket settlement
  -- (which bumps next_ticket_number) never depends on this check.
  if new.kind = 'wheel' and new.active and (tg_op = 'INSERT'
    or (new.active, new.draw_at, new.prize_pool_cents) is distinct from (old.active, old.draw_at, old.prize_pool_cents)) then
    draw_day := (new.draw_at at time zone 'Australia/Melbourne')::date;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('prize-wheel-day:' || draw_day::text, 0));
    select coalesce(sum(c.prize_pool_cents), 0) into day_total from public.raffle_campaigns c
      where c.kind = 'wheel' and c.id <> new.id
        and (c.draw_at at time zone 'Australia/Melbourne')::date = draw_day
        and (c.active or exists(select 1 from public.raffle_tickets t where t.campaign_id = c.id));
    if day_total + new.prize_pool_cents > 100000 then
      raise exception 'Prize wheel raffles drawn on the same day may not exceed $1,000 in total prizes.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_wheel_campaign() from public, anon, authenticated;
create trigger guard_wheel_campaign before insert or update on public.raffle_campaigns
  for each row when (new.kind = 'wheel') execute function public.guard_wheel_campaign();

-- Numbers sold (including voided tickets, which keep their slot) or held by
-- an unexpired checkout. Numbers only; never purchaser details.
create function public.wheel_raffle_unavailable_numbers(target_campaign uuid)
returns table(ticket_number integer) language sql stable security definer set search_path = '' as $$
  select t.ticket_number from public.raffle_tickets t where t.campaign_id = target_campaign
  union
  select unnest(o.selected_ticket_numbers) from public.raffle_orders o
    where o.campaign_id = target_campaign and o.status = 'pending_payment';
$$;
revoke all on function public.wheel_raffle_unavailable_numbers(uuid) from public, anon, authenticated;
grant execute on function public.wheel_raffle_unavailable_numbers(uuid) to service_role;

-- Server-side sales window and buyer-picked number reservation.
create function public.reserve_wheel_raffle_selection() returns trigger
language plpgsql security definer set search_path = '' as $$
declare wheel_kind text; c public.raffle_campaigns%rowtype;
begin
  select kind into wheel_kind from public.raffle_campaigns where id = new.campaign_id;
  if wheel_kind is distinct from 'wheel' then return new; end if;
  select * into strict c from public.raffle_campaigns where id = new.campaign_id for update;
  if new.payment_method not in ('stripe', 'cash') then
    raise exception 'Prize wheel tickets are sold by card or cash only.';
  end if;
  if new.status <> 'pending_payment' or new.currency <> 'aud'
    or new.amount_cents::bigint <> new.quantity::bigint * c.price_cents then
    raise exception 'Invalid prize wheel checkout.';
  end if;
  if not c.active or pg_catalog.now() < c.sales_open_at or pg_catalog.now() >= c.draw_at
    or (new.payment_method = 'stripe' and pg_catalog.now() > c.draw_at - interval '40 minutes')
    or exists(select 1 from public.raffle_draws where campaign_id = c.id) then
    raise exception 'Prize wheel sales are closed.';
  end if;
  if new.selected_ticket_numbers is null
    or cardinality(new.selected_ticket_numbers) is distinct from new.quantity
    or array_ndims(new.selected_ticket_numbers) is distinct from 1
    or exists(select 1 from unnest(new.selected_ticket_numbers) n where n is null or n not between 1 and c.wheel_divisions)
    or (select count(distinct n) from unnest(new.selected_ticket_numbers) n) <> new.quantity then
    raise exception 'Invalid prize wheel number selection';
  end if;
  if exists(select 1 from public.wheel_raffle_unavailable_numbers(c.id) u where u.ticket_number = any(new.selected_ticket_numbers)) then
    raise exception 'Prize wheel number unavailable';
  end if;
  return new;
end $$;
revoke all on function public.reserve_wheel_raffle_selection() from public, anon, authenticated;
create trigger reserve_wheel_raffle_selection before insert on public.raffle_orders
  for each row execute function public.reserve_wheel_raffle_selection();

create function public.guard_wheel_raffle_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.raffle_campaigns where id in (old.campaign_id, new.campaign_id) and kind = 'wheel') then
    if new.campaign_id is distinct from old.campaign_id or new.quantity is distinct from old.quantity
      or new.selected_ticket_numbers is distinct from old.selected_ticket_numbers
      or new.amount_cents is distinct from old.amount_cents then
      raise exception 'Prize wheel number reservations cannot be changed';
    end if;
    if new.status = 'pending_payment' and old.status <> 'pending_payment' then
      raise exception 'Prize wheel orders cannot return to pending payment; create a new checkout.';
    end if;
    if new.payment_method = 'bank_transfer' then
      raise exception 'Prize wheel tickets are sold by card or cash only.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_wheel_raffle_order() from public, anon, authenticated;
create trigger guard_wheel_raffle_order before update on public.raffle_orders
  for each row execute function public.guard_wheel_raffle_order();

-- The existing allocators (issue_paid_raffle_tickets) insert sequential
-- numbers; for wheel campaigns each inserted ticket takes the next unissued
-- number the buyer selected, so the settlement functions stay unchanged.
create function public.assign_wheel_ticket_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c record; o record; chosen integer;
begin
  select kind, code, wheel_divisions into c from public.raffle_campaigns where id = new.campaign_id;
  if c.kind is distinct from 'wheel' then return new; end if;
  select campaign_id, selected_ticket_numbers into o from public.raffle_orders where id = new.raffle_order_id;
  if o.campaign_id is distinct from new.campaign_id or o.selected_ticket_numbers is null then
    raise exception 'Prize wheel ticket requires a number selection.';
  end if;
  if not (new.ticket_number = any(o.selected_ticket_numbers))
    or exists(select 1 from public.raffle_tickets t where t.raffle_order_id = new.raffle_order_id and t.ticket_number = new.ticket_number) then
    select min(n) into chosen from unnest(o.selected_ticket_numbers) n
      where not exists(select 1 from public.raffle_tickets t where t.raffle_order_id = new.raffle_order_id and t.ticket_number = n);
    if chosen is null then raise exception 'Prize wheel order already holds all selected tickets.'; end if;
    new.ticket_number := chosen;
  end if;
  if new.ticket_number not between 1 and c.wheel_divisions then
    raise exception 'Prize wheel ticket number is outside the wheel.';
  end if;
  new.ticket_reference := 'NDCCWHL-' || substr(c.code, 8) || '-' || lpad(new.ticket_number::text, 3, '0');
  return new;
end $$;
revoke all on function public.assign_wheel_ticket_number() from public, anon, authenticated;
create trigger assign_wheel_ticket_number before insert on public.raffle_tickets
  for each row execute function public.assign_wheel_ticket_number();

create function public.guard_wheel_ticket_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.ticket_number, new.ticket_reference, new.campaign_id, new.raffle_order_id)
      is distinct from (old.ticket_number, old.ticket_reference, old.campaign_id, old.raffle_order_id)
    and exists(select 1 from public.raffle_campaigns where id in (old.campaign_id, new.campaign_id) and kind = 'wheel') then
    raise exception 'Prize wheel tickets cannot be renumbered.';
  end if;
  return new;
end $$;
revoke all on function public.guard_wheel_ticket_update() from public, anon, authenticated;
create trigger guard_wheel_ticket_update before update on public.raffle_tickets
  for each row execute function public.guard_wheel_ticket_update();

-- Atomic create/update of a wheel campaign and its prizes. The total prize
-- pool is always derived from the prizes.
create function public.save_wheel_campaign(payload jsonb, actor_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target uuid := nullif(payload->>'id', '')::uuid;
  existing public.raffle_campaigns%rowtype;
  draw_time timestamptz := (payload->>'draw_at')::timestamptz;
  open_time timestamptz := (payload->>'sales_open_at')::timestamptz;
  prizes jsonb := coalesce(payload->'prizes', '[]'::jsonb);
  pool bigint;
  new_code text;
  letter text;
  current_prizes jsonb;
  wanted_prizes jsonb;
begin
  if not exists(select 1 from public.committee_users where id = actor_id and is_active and role = 'admin') then
    raise exception 'Administrator required';
  end if;
  if jsonb_typeof(prizes) <> 'array' or jsonb_array_length(prizes) < 1 then
    raise exception 'Add at least one prize.';
  end if;
  select sum((p->>'retail_value_cents')::bigint * coalesce((p->>'quantity')::bigint, 1)) into pool
    from jsonb_array_elements(prizes) p;
  select coalesce(jsonb_agg(jsonb_build_object('position', ordinality, 'name', trim(p->>'name'),
      'description', nullif(trim(coalesce(p->>'description', '')), ''),
      'retail_value_cents', (p->>'retail_value_cents')::integer, 'quantity', coalesce((p->>'quantity')::integer, 1)) order by ordinality), '[]'::jsonb)
    into wanted_prizes from jsonb_array_elements(prizes) with ordinality as x(p, ordinality);
  if target is null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('prize-wheel-code', 0));
    select l into letter from unnest(string_to_array('A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z', ',')) l
      where not exists(select 1 from public.raffle_campaigns where code = 'NDCCWHL' || to_char(draw_time at time zone 'Australia/Melbourne', 'YYMMDD') || l)
      order by l limit 1;
    if letter is null then raise exception 'Too many prize wheel campaigns on this date.'; end if;
    new_code := 'NDCCWHL' || to_char(draw_time at time zone 'Australia/Melbourne', 'YYMMDD') || letter;
    insert into public.raffle_campaigns(name, code, year_code, price_cents, draw_at, draw_label, active,
      next_ticket_number, public_visibility_mode, public_opens_at, kind, wheel_divisions, sales_open_at, prize_pool_cents)
    values (trim(payload->>'name'), new_code, to_char(draw_time at time zone 'Australia/Melbourne', 'YY'),
      (payload->>'price_cents')::integer, draw_time, trim(payload->>'draw_label'), coalesce((payload->>'active')::boolean, false),
      1, coalesce(payload->>'public_visibility_mode', 'hidden'), nullif(payload->>'public_opens_at', '')::timestamptz,
      'wheel', (payload->>'wheel_divisions')::integer, open_time, pool)
    returning id into target;
  else
    select * into strict existing from public.raffle_campaigns where id = target for update;
    if existing.kind <> 'wheel' then raise exception 'Not a prize wheel campaign.'; end if;
    update public.raffle_campaigns set
      name = trim(payload->>'name'),
      price_cents = (payload->>'price_cents')::integer,
      draw_at = draw_time,
      year_code = case when draw_time is distinct from existing.draw_at then to_char(draw_time at time zone 'Australia/Melbourne', 'YY') else year_code end,
      draw_label = trim(payload->>'draw_label'),
      active = coalesce((payload->>'active')::boolean, existing.active),
      public_visibility_mode = coalesce(payload->>'public_visibility_mode', existing.public_visibility_mode),
      public_opens_at = nullif(payload->>'public_opens_at', '')::timestamptz,
      wheel_divisions = (payload->>'wheel_divisions')::integer,
      sales_open_at = open_time,
      prize_pool_cents = pool,
      updated_at = pg_catalog.now()
    where id = target;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('position', position, 'name', name, 'description', description,
      'retail_value_cents', retail_value_cents, 'quantity', quantity) order by position), '[]'::jsonb)
    into current_prizes from public.raffle_wheel_prizes where campaign_id = target;
  if current_prizes is distinct from wanted_prizes then
    delete from public.raffle_wheel_prizes where campaign_id = target;
    insert into public.raffle_wheel_prizes(campaign_id, position, name, description, retail_value_cents, quantity)
      select target, (p->>'position')::integer, p->>'name', p->>'description', (p->>'retail_value_cents')::integer, (p->>'quantity')::integer
      from jsonb_array_elements(wanted_prizes) p;
  end if;
  return target;
end $$;
revoke all on function public.save_wheel_campaign(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_wheel_campaign(jsonb, uuid) to service_role;

-- Staff cash sale for buyer-picked wheel numbers. Idempotent on sale_key.
create function public.record_wheel_cash_sale(sale_key uuid, target_campaign uuid, actor_id uuid,
  buyer_name text, buyer_email text, buyer_phone text, numbers integer[], quoted_price_cents integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.raffle_campaigns%rowtype; o public.raffle_orders%rowtype; n integer; refs jsonb; qty integer;
begin
  if sale_key is null or actor_id is null or target_campaign is null then raise exception 'Sale and staff identifiers are required'; end if;
  if not public.is_raffle_operator(actor_id) then raise exception 'Raffle permission is required'; end if;
  qty := coalesce(cardinality(numbers), 0);
  if qty not between 1 and 20 or length(trim(coalesce(buyer_name, ''))) not between 1 and 120
    or length(coalesce(buyer_email, '')) > 254 or coalesce(buyer_email, '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(coalesce(buyer_phone, '')) > 40 then raise exception 'Invalid purchaser details or numbers'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cash-raffle:' || sale_key::text, 0));
  select * into o from public.raffle_orders where cash_sale_key = sale_key;
  if found then
    if o.cash_received_by is distinct from actor_id or o.campaign_id <> target_campaign or o.customer_name <> trim(buyer_name)
      or o.customer_email <> lower(trim(buyer_email)) or coalesce(o.customer_phone, '') <> coalesce(trim(buyer_phone), '')
      or o.selected_ticket_numbers is distinct from numbers or o.amount_cents is distinct from qty * quoted_price_cents then
      raise exception 'This sale reference was already used with different details';
    end if;
  else
    select * into strict c from public.raffle_campaigns where id = target_campaign and kind = 'wheel' for update;
    if quoted_price_cents is distinct from c.price_cents then raise exception 'Ticket price changed. Reload before accepting payment'; end if;
    insert into public.raffle_orders(campaign_id, customer_name, customer_email, customer_phone, quantity, amount_cents,
      payment_reference, payment_method, cash_received_by, cash_received_at, cash_sale_key, selected_ticket_numbers)
    values (c.id, trim(buyer_name), lower(trim(buyer_email)), coalesce(trim(buyer_phone), ''), qty, qty * c.price_cents,
      public.allocate_payment_reference('raffle'), 'cash', actor_id, pg_catalog.now(), sale_key, numbers)
    returning * into o;
    foreach n in array numbers loop
      insert into public.raffle_tickets(raffle_order_id, campaign_id, ticket_number, ticket_reference)
      values (o.id, c.id, n, 'NDCCWHL-' || substr(c.code, 8) || '-' || lpad(n::text, 3, '0'));
    end loop;
    -- The status trigger atomically queues the existing receipt/ticket delivery job.
    update public.raffle_orders set status = 'paid', paid_at = pg_catalog.now(), updated_at = pg_catalog.now() where id = o.id;
  end if;
  select jsonb_agg(ticket_reference order by ticket_number) into refs from public.raffle_tickets where raffle_order_id = o.id;
  return jsonb_build_object('orderId', o.id, 'ticketReferences', refs, 'amountCents', o.amount_cents, 'paymentReference', o.payment_reference);
end $$;
revoke all on function public.record_wheel_cash_sale(uuid, uuid, uuid, text, text, text, integer[], integer) from public, anon, authenticated;
grant execute on function public.record_wheel_cash_sale(uuid, uuid, uuid, text, text, text, integer[], integer) to service_role;

-- Stores one live spin BEFORE the wheel animates. The winning number comes
-- from node:crypto randomInt on the server; this function only validates and
-- records it. respin: null (first spin for the prize), 'no_winner' (previous
-- spin landed on an unsold or already-winning number) or 'unclaimed'.
create function public.record_wheel_draw(target_campaign uuid, target_prize uuid, drawn_number integer,
  random_source text, actor_id uuid, respin text)
returns public.raffle_draws language plpgsql security definer set search_path = '' as $$
declare
  c public.raffle_campaigns%rowtype;
  p public.raffle_wheel_prizes%rowtype;
  latest public.raffle_draws%rowtype;
  reason text;
  winner uuid;
  sold_ticket uuid;
  next_number integer;
  inserted public.raffle_draws%rowtype;
begin
  if not public.is_raffle_operator(actor_id) then raise exception 'Raffle permission is required'; end if;
  select * into c from public.raffle_campaigns where id = target_campaign and kind = 'wheel' for update;
  if not found then raise exception 'Prize wheel campaign not found.'; end if;
  if pg_catalog.now() < c.draw_at then raise exception 'The draw cannot start before the advertised draw time.'; end if;
  if pg_catalog.now() - c.sales_open_at > interval '8 hours'
    and (pg_catalog.now() at time zone 'Australia/Melbourne')::date <> (c.sales_open_at at time zone 'Australia/Melbourne')::date then
    raise exception 'The draw must happen within 8 hours or on the same day as the first sale.';
  end if;
  if exists(select 1 from public.raffle_orders where campaign_id = c.id and status = 'pending_payment'
      and payment_method = 'stripe' and created_at > pg_catalog.now() - interval '36 minutes') then
    raise exception 'A card checkout may still be completing. Wait a few minutes and try again.';
  end if;
  if drawn_number is null or drawn_number not between 1 and c.wheel_divisions then raise exception 'Winning number is outside the wheel.'; end if;
  if length(coalesce(random_source, '')) not between 1 and 200 then raise exception 'Random source is required.'; end if;
  select * into p from public.raffle_wheel_prizes where id = target_prize and campaign_id = c.id;
  if not found then raise exception 'Prize not found for this wheel.'; end if;
  select * into latest from public.raffle_draws where prize_id = p.id order by draw_number desc limit 1;
  if respin is null then
    if latest.id is not null then raise exception 'This prize has already been drawn.'; end if;
    if exists(select 1 from public.raffle_wheel_prizes q where q.campaign_id = c.id and q.position < p.position
        and not exists(select 1 from public.raffle_draws d where d.prize_id = q.id and d.ticket_id is not null
          and d.draw_number = (select max(d2.draw_number) from public.raffle_draws d2 where d2.prize_id = q.id))) then
      raise exception 'Draw prizes in order: first draw wins first prize.';
    end if;
    reason := null;
  elsif respin = 'no_winner' then
    if latest.id is null or latest.ticket_id is not null then raise exception 'The latest spin for this prize has a winner.'; end if;
    select t.id into sold_ticket from public.raffle_tickets t join public.raffle_orders o on o.id = t.raffle_order_id
      where t.campaign_id = c.id and t.ticket_number = latest.winning_number and t.voided_at is null and o.status = 'paid';
    reason := case when sold_ticket is null then 'unsold' else 'already_won' end;
  elsif respin = 'unclaimed' then
    if latest.id is null or latest.ticket_id is null then raise exception 'There is no winner to replace for this prize.'; end if;
    if exists(select 1 from public.raffle_wheel_collections where draw_id = latest.id) then
      raise exception 'This prize has already been collected.';
    end if;
    reason := 'unclaimed';
  else
    raise exception 'Unknown re-spin reason.';
  end if;
  if not exists(select 1 from public.raffle_tickets t join public.raffle_orders o on o.id = t.raffle_order_id
      where t.campaign_id = c.id and t.voided_at is null and o.status = 'paid'
        and not exists(select 1 from public.raffle_draws d where d.ticket_id = t.id)) then
    raise exception 'No eligible tickets remain for this draw.';
  end if;
  select t.id into winner from public.raffle_tickets t join public.raffle_orders o on o.id = t.raffle_order_id
    where t.campaign_id = c.id and t.ticket_number = drawn_number and t.voided_at is null and o.status = 'paid'
      and not exists(select 1 from public.raffle_draws d where d.ticket_id = t.id);
  select coalesce(max(draw_number), 0) + 1 into next_number from public.raffle_draws where campaign_id = c.id;
  insert into public.raffle_draws(campaign_id, prize_id, draw_number, winning_number, ticket_id, random_value, operator_id, respin_reason)
  values (c.id, p.id, next_number, drawn_number, winner, random_source, actor_id, reason)
  returning * into inserted;
  return inserted;
end $$;
revoke all on function public.record_wheel_draw(uuid, uuid, integer, text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_wheel_draw(uuid, uuid, integer, text, uuid, text) to service_role;

create function public.record_wheel_prize_collection(target_draw uuid, actor_id uuid, collection_note text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare d public.raffle_draws%rowtype;
begin
  if not public.is_raffle_operator(actor_id) then raise exception 'Raffle permission is required'; end if;
  select * into strict d from public.raffle_draws where id = target_draw;
  if d.ticket_id is null or d.draw_number <> (select max(draw_number) from public.raffle_draws where prize_id = d.prize_id) then
    raise exception 'Only the current winner of a prize can collect it.';
  end if;
  insert into public.raffle_wheel_collections(draw_id, recorded_by, note)
    values (d.id, actor_id, nullif(trim(coalesce(collection_note, '')), ''))
    on conflict (draw_id) do nothing;
  return found;
end $$;
revoke all on function public.record_wheel_prize_collection(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_wheel_prize_collection(uuid, uuid, text) to service_role;

create function public.record_wheel_winner_email(target_draw uuid, actor_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_raffle_operator(actor_id) then raise exception 'Raffle permission is required'; end if;
  if not exists(select 1 from public.raffle_draws where id = target_draw and ticket_id is not null) then
    raise exception 'Only a winning draw can be emailed.';
  end if;
  insert into public.raffle_wheel_winner_emails(draw_id, sent_by) values (target_draw, actor_id)
    on conflict (draw_id) do nothing;
  return found;
end $$;
revoke all on function public.record_wheel_winner_email(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_wheel_winner_email(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
