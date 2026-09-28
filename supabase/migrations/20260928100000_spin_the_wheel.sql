-- Spin the Wheel: an online wheel that visitors and club members spin on the
-- website. Committee users configure wheels, segments, odds (weights), prize
-- stock, free spins per club account and a price for paid spins.
--
-- Separate from the Dinos Prize Wheel small raffle (raffle_campaigns kind
-- 'wheel', drawn live at the clubrooms); nothing here touches those tables.
--
-- Design notes:
--   * The server picks the winning segment (node:crypto) and records it through
--     record_spin_wheel_result() BEFORE the browser animates.
--   * Paid spins are ordinary public.orders rows (order_category 'spin_wheel')
--     paid through the existing order checkout, so Stripe settlement, the
--     payment ledger, receipts, refunds and disputes all use the existing
--     order flow. A trigger on orders grants the purchased spins only while the
--     order's derived payment_status is 'paid', and revokes the unused ones when
--     the order is refunded or a dispute withholds funds.
--   * Guest spins belong to a pass. The pass link token is an HMAC of the pass
--     id (server secret), so it can be re-derived and re-sent at any time; only
--     its SHA-256 hash is stored here.
--   * Results keep a snapshot of the segment, so segments can be deleted later
--     (segment_id is set null).
--
-- Rollback (spin results are the only record of what people won; export them
-- first):
--   begin;
--   drop trigger spin_wheel_order_payment on public.orders;
--   drop function public.spin_wheel_order_payment_trigger();
--   drop function public.sync_spin_wheel_order_entitlements(uuid);
--   drop function public.ensure_spin_wheel_free_entitlements(uuid,uuid);
--   drop function public.record_spin_wheel_result(uuid,uuid,uuid,uuid,text,text,text,text);
--   drop function public.save_spin_wheel(jsonb,uuid);
--   drop table public.spin_wheel_results, public.spin_wheel_entitlements,
--     public.spin_wheel_orders, public.spin_wheel_passes, public.spin_wheel_segments,
--     public.spin_wheels;
--   notify pgrst,'reload schema';
--   commit;
begin;
set local lock_timeout = '3s';

create table public.spin_wheels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft','live','paused','ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  free_spins_per_account integer not null default 0 check (free_spins_per_account between 0 and 100),
  spin_price_cents integer check (spin_price_cents is null or spin_price_cents between 50 and 100000),
  max_spins_per_order integer not null default 20 check (max_spins_per_order between 1 and 100),
  claim_instructions text check (claim_instructions is null or char_length(claim_instructions) <= 2000),
  public_visibility_mode text not null default 'hidden' check (public_visibility_mode in ('hidden','scheduled','visible')),
  public_opens_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (public_visibility_mode <> 'scheduled' or public_opens_at is not null)
);
comment on table public.spin_wheels is 'Online Spin the Wheel campaigns. Separate from the Prize Wheel small raffle.';

create table public.spin_wheel_segments (
  id uuid primary key default gen_random_uuid(),
  wheel_id uuid not null references public.spin_wheels(id) on delete cascade,
  position integer not null check (position between 1 and 48),
  label text not null check (char_length(label) between 1 and 24),
  prize_name text check (prize_name is null or char_length(prize_name) <= 120),
  prize_description text check (prize_description is null or char_length(prize_description) <= 500),
  is_prize boolean not null default false,
  weight integer not null default 1 check (weight between 0 and 1000000),
  stock integer check (stock is null or stock between 0 and 1000000),
  colour text not null default 'maroon' check (colour in ('maroon','navy','blue','gold','cream')),
  unique (wheel_id, position) deferrable initially immediate,
  check (not is_prize or char_length(coalesce(prize_name, '')) > 0)
);
comment on column public.spin_wheel_segments.weight is 'Relative odds. Probability = weight / sum of weights of segments that are in stock.';
comment on column public.spin_wheel_segments.stock is 'Remaining prizes for this segment; null = unlimited. Decremented by record_spin_wheel_result.';

create table public.spin_wheel_passes (
  id uuid primary key default gen_random_uuid(),
  wheel_id uuid not null references public.spin_wheels(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email text not null check (char_length(email) between 3 and 254),
  name text check (name is null or char_length(name) <= 120),
  created_at timestamptz not null default now()
);
create index spin_wheel_passes_email_idx on public.spin_wheel_passes (lower(email));
comment on table public.spin_wheel_passes is 'Guest spin passes. The link token is HMAC(server secret, pass id); only its SHA-256 hash is stored.';

create table public.spin_wheel_orders (
  id uuid primary key default gen_random_uuid(),
  wheel_id uuid not null references public.spin_wheels(id),
  order_id uuid not null unique references public.orders(id),
  auth_user_id uuid,
  pass_id uuid references public.spin_wheel_passes(id),
  quantity integer not null check (quantity between 1 and 100),
  unit_price_cents integer not null check (unit_price_cents > 0),
  paid_at timestamptz,
  pass_emailed_at timestamptz,
  created_at timestamptz not null default now(),
  check (auth_user_id is not null or pass_id is not null)
);
create index spin_wheel_orders_wheel_idx on public.spin_wheel_orders (wheel_id, created_at desc);
comment on table public.spin_wheel_orders is 'Links a public.orders row (order_category spin_wheel) to the spins it buys.';

create table public.spin_wheel_entitlements (
  id uuid primary key default gen_random_uuid(),
  wheel_id uuid not null references public.spin_wheels(id) on delete cascade,
  auth_user_id uuid,
  pass_id uuid references public.spin_wheel_passes(id) on delete cascade,
  source text not null check (source in ('free','purchase','admin_grant')),
  spin_order_id uuid references public.spin_wheel_orders(id),
  seq integer,
  granted_by uuid,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (auth_user_id is not null or pass_id is not null),
  check (source <> 'purchase' or (spin_order_id is not null and seq is not null)),
  check (source <> 'free' or (auth_user_id is not null and seq is not null))
);
-- One free entitlement per slot per account, and one purchased entitlement per
-- slot per order, so concurrent top-ups and webhook retries cannot over-grant.
create unique index spin_wheel_entitlements_free_slot on public.spin_wheel_entitlements (wheel_id, auth_user_id, seq) where source = 'free';
create unique index spin_wheel_entitlements_order_slot on public.spin_wheel_entitlements (spin_order_id, seq) where spin_order_id is not null;
create index spin_wheel_entitlements_user_open on public.spin_wheel_entitlements (wheel_id, auth_user_id, created_at) where used_at is null and revoked_at is null;
create index spin_wheel_entitlements_pass_open on public.spin_wheel_entitlements (wheel_id, pass_id, created_at) where used_at is null and revoked_at is null;

create table public.spin_wheel_results (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^SPIN-[0-9A-HJKMNP-TV-Z]{6}$'),
  wheel_id uuid not null references public.spin_wheels(id),
  entitlement_id uuid not null unique references public.spin_wheel_entitlements(id),
  segment_id uuid references public.spin_wheel_segments(id) on delete set null,
  segment_position integer not null,
  segment_label text not null,
  prize_name text,
  prize_description text,
  is_prize boolean not null,
  random_source text not null check (char_length(random_source) <= 200),
  auth_user_id uuid,
  pass_id uuid,
  spinner_email text check (spinner_email is null or char_length(spinner_email) <= 254),
  spinner_name text check (spinner_name is null or char_length(spinner_name) <= 120),
  winner_emailed_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text check (void_reason is null or char_length(void_reason) <= 500),
  created_at timestamptz not null default now(),
  check (voided_at is null or char_length(coalesce(void_reason, '')) > 0)
);
create index spin_wheel_results_wheel_idx on public.spin_wheel_results (wheel_id, created_at desc);
create index spin_wheel_results_user_idx on public.spin_wheel_results (auth_user_id, created_at desc) where auth_user_id is not null;
create index spin_wheel_results_pass_idx on public.spin_wheel_results (pass_id, created_at desc) where pass_id is not null;
comment on table public.spin_wheel_results is 'Every spin. Snapshot of the segment at spin time; segment_id is null once the segment is deleted.';

alter table public.spin_wheels enable row level security;
alter table public.spin_wheel_segments enable row level security;
alter table public.spin_wheel_passes enable row level security;
alter table public.spin_wheel_orders enable row level security;
alter table public.spin_wheel_entitlements enable row level security;
alter table public.spin_wheel_results enable row level security;
revoke all on public.spin_wheels, public.spin_wheel_segments, public.spin_wheel_passes,
  public.spin_wheel_orders, public.spin_wheel_entitlements, public.spin_wheel_results
  from public, anon, authenticated;
grant select, insert, update, delete on public.spin_wheels, public.spin_wheel_segments,
  public.spin_wheel_passes, public.spin_wheel_orders, public.spin_wheel_entitlements,
  public.spin_wheel_results to service_role;

-- ---- Free spins: idempotent top-up to the wheel's allowance ----
create function public.ensure_spin_wheel_free_entitlements(target_wheel uuid, target_user uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  allowance integer;
  added integer := 0;
begin
  if target_user is null then return 0; end if;
  select free_spins_per_account into allowance from public.spin_wheels
    where id = target_wheel and status in ('live','paused');
  if allowance is null or allowance < 1 then return 0; end if;
  insert into public.spin_wheel_entitlements (wheel_id, auth_user_id, source, seq)
    select target_wheel, target_user, 'free', slot from generate_series(1, allowance) as slot
    on conflict (wheel_id, auth_user_id, seq) where source = 'free' do nothing;
  get diagnostics added = row_count;
  return added;
end $$;
revoke all on function public.ensure_spin_wheel_free_entitlements(uuid,uuid) from public, anon, authenticated;
grant execute on function public.ensure_spin_wheel_free_entitlements(uuid,uuid) to service_role;

-- ---- Paid spins follow the order's derived payment status ----
create function public.sync_spin_wheel_order_entitlements(target_order uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  link public.spin_wheel_orders%rowtype;
  v_payment_status text;
  v_deleted timestamptz;
  added integer := 0;
begin
  select * into link from public.spin_wheel_orders where order_id = target_order for update;
  if not found then return 0; end if;
  select o.payment_status, o.deleted_at into v_payment_status, v_deleted
    from public.orders o where o.id = target_order;
  if v_payment_status = 'paid' and v_deleted is null then
    insert into public.spin_wheel_entitlements (wheel_id, auth_user_id, pass_id, source, spin_order_id, seq)
      select link.wheel_id, link.auth_user_id, link.pass_id, 'purchase', link.id, slot
      from generate_series(1, link.quantity) as slot
      on conflict (spin_order_id, seq) where spin_order_id is not null do nothing;
    get diagnostics added = row_count;
    update public.spin_wheel_entitlements set revoked_at = null
      where spin_order_id = link.id and used_at is null and revoked_at is not null;
    update public.spin_wheel_orders set paid_at = coalesce(paid_at, now()) where id = link.id;
  else
    update public.spin_wheel_entitlements set revoked_at = now()
      where spin_order_id = link.id and used_at is null and revoked_at is null;
  end if;
  return added;
end $$;
revoke all on function public.sync_spin_wheel_order_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.sync_spin_wheel_order_entitlements(uuid) to service_role;

-- Never let spin bookkeeping fail a payment settlement: on error the order
-- update still commits and the status route / daily cron re-sync later.
create function public.spin_wheel_order_payment_trigger()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_status is distinct from old.payment_status or new.deleted_at is distinct from old.deleted_at then
    begin
      perform public.sync_spin_wheel_order_entitlements(new.id);
    exception when others then
      raise warning 'Spin the Wheel entitlement sync failed for order %: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end $$;
revoke all on function public.spin_wheel_order_payment_trigger() from public, anon, authenticated;
create trigger spin_wheel_order_payment
  after update of payment_status, deleted_at on public.orders
  for each row when (new.order_category = 'spin_wheel')
  execute function public.spin_wheel_order_payment_trigger();

-- ---- Record one spin atomically ----
-- The caller (server) has already picked target_segment with a CSPRNG. This
-- locks one unused entitlement and the segment, checks and decrements stock,
-- marks the entitlement used and stores the result, all in one transaction.
create function public.record_spin_wheel_result(
  target_wheel uuid, target_user uuid, target_pass uuid, target_segment uuid,
  random_source text, result_reference text, spinner_email text, spinner_name text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  wheel public.spin_wheels%rowtype;
  segment public.spin_wheel_segments%rowtype;
  v_entitlement uuid;
  result public.spin_wheel_results%rowtype;
  remaining integer;
begin
  if (target_user is null) = (target_pass is null) then
    raise exception 'spin_wheel:no_spinner';
  end if;
  select * into wheel from public.spin_wheels where id = target_wheel for share;
  if not found or wheel.status <> 'live'
     or (wheel.starts_at is not null and now() < wheel.starts_at)
     or (wheel.ends_at is not null and now() >= wheel.ends_at) then
    raise exception 'spin_wheel:not_live';
  end if;
  select e.id into v_entitlement from public.spin_wheel_entitlements e
    where e.wheel_id = target_wheel and e.used_at is null and e.revoked_at is null
      and ((target_user is not null and e.auth_user_id = target_user)
        or (target_pass is not null and e.pass_id = target_pass))
    order by e.created_at, e.id
    limit 1 for update skip locked;
  if v_entitlement is null then
    raise exception 'spin_wheel:no_spins_left';
  end if;
  select * into segment from public.spin_wheel_segments
    where id = target_segment and wheel_id = target_wheel for update;
  if not found or segment.weight < 1 then
    raise exception 'spin_wheel:segment_unavailable';
  end if;
  if segment.stock is not null and segment.stock < 1 then
    raise exception 'spin_wheel:segment_out_of_stock';
  end if;
  if segment.stock is not null then
    update public.spin_wheel_segments set stock = stock - 1 where id = segment.id;
  end if;
  update public.spin_wheel_entitlements set used_at = now() where id = v_entitlement;
  insert into public.spin_wheel_results (reference, wheel_id, entitlement_id, segment_id, segment_position,
      segment_label, prize_name, prize_description, is_prize, random_source, auth_user_id, pass_id,
      spinner_email, spinner_name)
    values (result_reference, target_wheel, v_entitlement, segment.id, segment.position,
      segment.label, segment.prize_name, segment.prize_description, segment.is_prize, random_source,
      target_user, target_pass, left(spinner_email, 254), left(spinner_name, 120))
    returning * into result;
  select count(*) into remaining from public.spin_wheel_entitlements e
    where e.wheel_id = target_wheel and e.used_at is null and e.revoked_at is null
      and ((target_user is not null and e.auth_user_id = target_user)
        or (target_pass is not null and e.pass_id = target_pass));
  return jsonb_build_object(
    'id', result.id, 'reference', result.reference, 'segment_position', result.segment_position,
    'segment_label', result.segment_label, 'prize_name', result.prize_name,
    'prize_description', result.prize_description, 'is_prize', result.is_prize,
    'created_at', result.created_at, 'spins_left', remaining);
end $$;
revoke all on function public.record_spin_wheel_result(uuid,uuid,uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_spin_wheel_result(uuid,uuid,uuid,uuid,text,text,text,text) to service_role;

-- ---- Save a wheel and its full segment list atomically ----
-- payload: wheel fields plus "segments": [{ id?, label, prize_name, ... }] in
-- display order. Segments missing from the list are deleted (results keep
-- their snapshot). Returns the wheel id.
create function public.save_spin_wheel(payload jsonb, actor_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_wheel uuid := nullif(payload->>'id', '')::uuid;
  item jsonb;
  item_id uuid;
  kept uuid[] := '{}';
  pos integer := 0;
begin
  if jsonb_typeof(payload->'segments') <> 'array'
     or jsonb_array_length(payload->'segments') < 2
     or jsonb_array_length(payload->'segments') > 48 then
    raise exception 'spin_wheel:segment_count';
  end if;
  if v_wheel is null then
    insert into public.spin_wheels (name, description, status, starts_at, ends_at, free_spins_per_account,
        spin_price_cents, max_spins_per_order, claim_instructions, public_visibility_mode, public_opens_at, created_by)
      values (payload->>'name', nullif(payload->>'description', ''), payload->>'status',
        nullif(payload->>'starts_at', '')::timestamptz, nullif(payload->>'ends_at', '')::timestamptz,
        (payload->>'free_spins_per_account')::integer, nullif(payload->>'spin_price_cents', '')::integer,
        (payload->>'max_spins_per_order')::integer, nullif(payload->>'claim_instructions', ''),
        payload->>'public_visibility_mode', nullif(payload->>'public_opens_at', '')::timestamptz, actor_id)
      returning id into v_wheel;
  else
    update public.spin_wheels set
        name = payload->>'name', description = nullif(payload->>'description', ''), status = payload->>'status',
        starts_at = nullif(payload->>'starts_at', '')::timestamptz, ends_at = nullif(payload->>'ends_at', '')::timestamptz,
        free_spins_per_account = (payload->>'free_spins_per_account')::integer,
        spin_price_cents = nullif(payload->>'spin_price_cents', '')::integer,
        max_spins_per_order = (payload->>'max_spins_per_order')::integer,
        claim_instructions = nullif(payload->>'claim_instructions', ''),
        public_visibility_mode = payload->>'public_visibility_mode',
        public_opens_at = nullif(payload->>'public_opens_at', '')::timestamptz,
        updated_at = now()
      where id = v_wheel;
    if not found then raise exception 'spin_wheel:not_found'; end if;
  end if;

  for item in select value from jsonb_array_elements(payload->'segments') loop
    item_id := nullif(item->>'id', '')::uuid;
    if item_id is not null then kept := kept || item_id; end if;
  end loop;
  delete from public.spin_wheel_segments s where s.wheel_id = v_wheel and not (s.id = any(kept));
  -- Positions are reassigned in place; the unique check runs at the end.
  set constraints all deferred;
  for item in select value from jsonb_array_elements(payload->'segments') loop
    pos := pos + 1;
    item_id := nullif(item->>'id', '')::uuid;
    if item_id is not null then
      update public.spin_wheel_segments s set
          position = pos, label = item->>'label', prize_name = nullif(item->>'prize_name', ''),
          prize_description = nullif(item->>'prize_description', ''),
          is_prize = coalesce((item->>'is_prize')::boolean, false),
          weight = (item->>'weight')::integer, stock = nullif(item->>'stock', '')::integer,
          colour = item->>'colour'
        where s.id = item_id and s.wheel_id = v_wheel;
      if not found then raise exception 'spin_wheel:segment_not_found'; end if;
    else
      insert into public.spin_wheel_segments (wheel_id, position, label, prize_name, prize_description,
          is_prize, weight, stock, colour)
        values (v_wheel, pos, item->>'label', nullif(item->>'prize_name', ''),
          nullif(item->>'prize_description', ''), coalesce((item->>'is_prize')::boolean, false),
          (item->>'weight')::integer, nullif(item->>'stock', '')::integer, item->>'colour');
    end if;
  end loop;
  set constraints all immediate;
  return v_wheel;
end $$;
revoke all on function public.save_spin_wheel(jsonb,uuid) from public, anon, authenticated;
grant execute on function public.save_spin_wheel(jsonb,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
