-- Spin the Wheel: rules for the Dino Wheel (club decision, 28 September 2026).
--
--   * spin_wheels.max_spins_per_day: each person (by email, across their club
--     account and any spin links) may spin at most this many times per
--     Australia/Melbourne calendar day. Null = no daily limit. Bonus spins
--     (below) do not count and can always be used.
--   * spin_wheel_segments.once_per_spinner: a prize a person may win only
--     once per wheel (for example a raffle entry). Landing on it again gives a
--     free bonus spin instead: no stock is used and no prize is recorded.
--     Wins are matched by prize name across once-per-person segments, by the
--     spinner's email, account and spin link; voided wins do not count.
--   * spin_wheel_daily_capacity(): advisory figures for checkout and the page
--     (spins used today, spins held, bonus spins for this account or link).
--   * Winner receipts are copied to the new 'spin_wheel_winners' notification
--     list (editable in the CMS), seeded with the addresses the club supplied.
--
-- Rollback (export results first):
--   begin;
--   drop function public.spin_wheel_daily_capacity(uuid,uuid,uuid,text);
--   -- re-run record_spin_wheel_result and save_spin_wheel from
--   -- 20260928100000_spin_the_wheel.sql, then:
--   delete from public.spin_wheel_entitlements where source = 'bonus';
--   alter table public.spin_wheel_entitlements drop constraint spin_wheel_entitlements_source_check;
--   alter table public.spin_wheel_entitlements add constraint spin_wheel_entitlements_source_check
--     check (source in ('free','purchase','admin_grant'));
--   alter table public.spin_wheel_entitlements drop column bonus_from_result;
--   alter table public.spin_wheel_results drop column repeat_bonus;
--   alter table public.spin_wheel_segments drop column once_per_spinner;
--   alter table public.spin_wheels drop column max_spins_per_day;
--   delete from public.notification_recipients where event_type = 'spin_wheel_winners';
--   -- restore the event_type check from 20260927160000_notification_event_song_requests.sql
--   notify pgrst,'reload schema';
--   commit;
begin;
set local lock_timeout = '3s';

alter table public.spin_wheels add column max_spins_per_day integer
  check (max_spins_per_day is null or max_spins_per_day between 1 and 100);
comment on column public.spin_wheels.max_spins_per_day is 'Spins per person per Melbourne day (bonus spins excluded). Null = no limit.';

alter table public.spin_wheel_segments add column once_per_spinner boolean not null default false;
comment on column public.spin_wheel_segments.once_per_spinner is 'Prize can be won once per person per wheel; landing on it again gives a free bonus spin.';

alter table public.spin_wheel_results add column repeat_bonus boolean not null default false;
comment on column public.spin_wheel_results.repeat_bonus is 'Landed on a once-per-person prize already won: no prize, a bonus spin was granted.';

alter table public.spin_wheel_entitlements add column bonus_from_result uuid unique references public.spin_wheel_results(id);
alter table public.spin_wheel_entitlements drop constraint spin_wheel_entitlements_source_check;
alter table public.spin_wheel_entitlements add constraint spin_wheel_entitlements_source_check
  check (source in ('free','purchase','admin_grant','bonus'));
alter table public.spin_wheel_entitlements add constraint spin_wheel_entitlements_bonus_link
  check ((source = 'bonus') = (bonus_from_result is not null));

create index spin_wheel_results_email_day_idx on public.spin_wheel_results (wheel_id, lower(spinner_email), created_at);

-- Start of today in Melbourne, as a timestamptz.
create function public.spin_wheel_melbourne_day_start()
returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc('day', now() at time zone 'Australia/Melbourne')) at time zone 'Australia/Melbourne';
$$;
revoke all on function public.spin_wheel_melbourne_day_start() from public, anon, authenticated;
grant execute on function public.spin_wheel_melbourne_day_start() to service_role;

-- ---- Record one spin atomically (replaces 20260928100000) ----
create or replace function public.record_spin_wheel_result(
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
  v_key text := lower(trim(coalesce(spinner_email, '')));
  used_today integer := 0;
  limit_reached boolean := false;
  is_repeat boolean := false;
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
  -- One spin at a time per person, so the daily count and repeat check hold.
  perform pg_advisory_xact_lock(hashtextextended('spin_wheel:' || target_wheel::text || ':' || v_key, 0));

  if wheel.max_spins_per_day is not null then
    select count(*) into used_today
      from public.spin_wheel_results r
      join public.spin_wheel_entitlements e on e.id = r.entitlement_id
      where r.wheel_id = target_wheel and r.created_at >= public.spin_wheel_melbourne_day_start()
        and e.source <> 'bonus'
        and (lower(r.spinner_email) = v_key
          or (target_user is not null and r.auth_user_id = target_user)
          or (target_pass is not null and r.pass_id = target_pass));
    limit_reached := used_today >= wheel.max_spins_per_day;
  end if;

  -- Bonus spins first; once today's limit is reached, only bonus spins.
  select e.id into v_entitlement from public.spin_wheel_entitlements e
    where e.wheel_id = target_wheel and e.used_at is null and e.revoked_at is null
      and (not limit_reached or e.source = 'bonus')
      and ((target_user is not null and e.auth_user_id = target_user)
        or (target_pass is not null and e.pass_id = target_pass))
    order by (e.source = 'bonus') desc, e.created_at, e.id
    limit 1 for update skip locked;
  if v_entitlement is null then
    if limit_reached then raise exception 'spin_wheel:daily_limit'; end if;
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

  if segment.once_per_spinner and segment.is_prize then
    select exists (
      select 1 from public.spin_wheel_results r
      where r.wheel_id = target_wheel and r.is_prize and r.voided_at is null
        and lower(coalesce(r.prize_name, '')) = lower(coalesce(segment.prize_name, ''))
        and (lower(r.spinner_email) = v_key
          or (target_user is not null and r.auth_user_id = target_user)
          or (target_pass is not null and r.pass_id = target_pass))
    ) into is_repeat;
  end if;

  if segment.stock is not null and not is_repeat then
    update public.spin_wheel_segments set stock = stock - 1 where id = segment.id;
  end if;
  update public.spin_wheel_entitlements set used_at = now() where id = v_entitlement;
  insert into public.spin_wheel_results (reference, wheel_id, entitlement_id, segment_id, segment_position,
      segment_label, prize_name, prize_description, is_prize, random_source, auth_user_id, pass_id,
      spinner_email, spinner_name, repeat_bonus)
    values (result_reference, target_wheel, v_entitlement, segment.id, segment.position,
      segment.label, segment.prize_name, case when is_repeat then null else segment.prize_description end,
      segment.is_prize and not is_repeat, random_source,
      target_user, target_pass, left(spinner_email, 254), left(spinner_name, 120), is_repeat)
    returning * into result;
  if is_repeat then
    insert into public.spin_wheel_entitlements (wheel_id, auth_user_id, pass_id, source, bonus_from_result)
      values (target_wheel, target_user, target_pass, 'bonus', result.id);
  end if;
  select count(*) into remaining from public.spin_wheel_entitlements e
    where e.wheel_id = target_wheel and e.used_at is null and e.revoked_at is null
      and ((target_user is not null and e.auth_user_id = target_user)
        or (target_pass is not null and e.pass_id = target_pass));
  return jsonb_build_object(
    'id', result.id, 'reference', result.reference, 'segment_position', result.segment_position,
    'segment_label', result.segment_label, 'prize_name', result.prize_name,
    'prize_description', result.prize_description, 'is_prize', result.is_prize,
    'repeat_bonus', result.repeat_bonus, 'created_at', result.created_at, 'spins_left', remaining);
end $$;
revoke all on function public.record_spin_wheel_result(uuid,uuid,uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_spin_wheel_result(uuid,uuid,uuid,uuid,text,text,text,text) to service_role;

-- ---- Today's spins for one person ----
-- The hard rule is enforced by record_spin_wheel_result (atomic, per person).
-- This is advisory for checkout and the page: limit null = no daily limit;
-- remaining = limit - non-bonus spins used today - unused non-bonus spins held
-- (account and every spin link with this email). Unpaid orders are not
-- counted, so an abandoned card checkout never blocks a new one; spins bought
-- beyond today's allowance carry over to later days. Bonus spins are counted
-- only for the exact account or spin link in use, as only those can be spent.
create function public.spin_wheel_daily_capacity(target_wheel uuid, target_user uuid, target_pass uuid, target_email text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit integer;
  v_key text := lower(trim(coalesce(target_email, '')));
  v_used integer;
  v_open integer;
  v_bonus integer;
begin
  select max_spins_per_day into v_limit from public.spin_wheels where id = target_wheel;
  select count(*) into v_used
    from public.spin_wheel_results r
    join public.spin_wheel_entitlements e on e.id = r.entitlement_id
    where r.wheel_id = target_wheel and r.created_at >= public.spin_wheel_melbourne_day_start()
      and e.source <> 'bonus'
      and ((v_key <> '' and lower(r.spinner_email) = v_key)
        or (target_user is not null and r.auth_user_id = target_user)
        or (target_pass is not null and r.pass_id = target_pass));
  select count(*) into v_open
    from public.spin_wheel_entitlements e
    left join public.spin_wheel_passes p on p.id = e.pass_id
    where e.wheel_id = target_wheel and e.used_at is null and e.revoked_at is null and e.source <> 'bonus'
      and ((target_user is not null and e.auth_user_id = target_user)
        or (target_pass is not null and e.pass_id = target_pass)
        or (v_key <> '' and lower(p.email) = v_key));
  select count(*) into v_bonus
    from public.spin_wheel_entitlements e
    where e.wheel_id = target_wheel and e.used_at is null and e.revoked_at is null and e.source = 'bonus'
      and ((target_user is not null and e.auth_user_id = target_user)
        or (target_pass is not null and e.pass_id = target_pass));
  return jsonb_build_object(
    'limit', v_limit, 'used_today', v_used, 'open_spins', v_open, 'bonus_spins', v_bonus,
    'remaining', case when v_limit is null then null else greatest(v_limit - v_used - v_open, 0) end,
    'can_spin_today', v_limit is null or v_used < v_limit or v_bonus > 0);
end $$;
revoke all on function public.spin_wheel_daily_capacity(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.spin_wheel_daily_capacity(uuid,uuid,uuid,text) to service_role;

-- ---- Save a wheel and its segments (replaces 20260928100000) ----
create or replace function public.save_spin_wheel(payload jsonb, actor_id uuid)
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
        spin_price_cents, max_spins_per_order, max_spins_per_day, claim_instructions, public_visibility_mode,
        public_opens_at, created_by)
      values (payload->>'name', nullif(payload->>'description', ''), payload->>'status',
        nullif(payload->>'starts_at', '')::timestamptz, nullif(payload->>'ends_at', '')::timestamptz,
        (payload->>'free_spins_per_account')::integer, nullif(payload->>'spin_price_cents', '')::integer,
        (payload->>'max_spins_per_order')::integer, nullif(payload->>'max_spins_per_day', '')::integer,
        nullif(payload->>'claim_instructions', ''),
        payload->>'public_visibility_mode', nullif(payload->>'public_opens_at', '')::timestamptz, actor_id)
      returning id into v_wheel;
  else
    update public.spin_wheels set
        name = payload->>'name', description = nullif(payload->>'description', ''), status = payload->>'status',
        starts_at = nullif(payload->>'starts_at', '')::timestamptz, ends_at = nullif(payload->>'ends_at', '')::timestamptz,
        free_spins_per_account = (payload->>'free_spins_per_account')::integer,
        spin_price_cents = nullif(payload->>'spin_price_cents', '')::integer,
        max_spins_per_order = (payload->>'max_spins_per_order')::integer,
        max_spins_per_day = nullif(payload->>'max_spins_per_day', '')::integer,
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
  set constraints all deferred;
  for item in select value from jsonb_array_elements(payload->'segments') loop
    pos := pos + 1;
    item_id := nullif(item->>'id', '')::uuid;
    if item_id is not null then
      update public.spin_wheel_segments s set
          position = pos, label = item->>'label', prize_name = nullif(item->>'prize_name', ''),
          prize_description = nullif(item->>'prize_description', ''),
          is_prize = coalesce((item->>'is_prize')::boolean, false),
          once_per_spinner = coalesce((item->>'once_per_spinner')::boolean, false),
          weight = (item->>'weight')::integer, stock = nullif(item->>'stock', '')::integer,
          colour = item->>'colour'
        where s.id = item_id and s.wheel_id = v_wheel;
      if not found then raise exception 'spin_wheel:segment_not_found'; end if;
    else
      insert into public.spin_wheel_segments (wheel_id, position, label, prize_name, prize_description,
          is_prize, once_per_spinner, weight, stock, colour)
        values (v_wheel, pos, item->>'label', nullif(item->>'prize_name', ''),
          nullif(item->>'prize_description', ''), coalesce((item->>'is_prize')::boolean, false),
          coalesce((item->>'once_per_spinner')::boolean, false),
          (item->>'weight')::integer, nullif(item->>'stock', '')::integer, item->>'colour');
    end if;
  end loop;
  set constraints all immediate;
  return v_wheel;
end $$;
revoke all on function public.save_spin_wheel(jsonb,uuid) from public, anon, authenticated;
grant execute on function public.save_spin_wheel(jsonb,uuid) to service_role;

-- ---- Winner receipt copies ----
alter table public.notification_recipients drop constraint if exists notification_recipients_event_type_check;
alter table public.notification_recipients add constraint notification_recipients_event_type_check
  check (event_type in (
    'dino_registration_copy',
    'dino_receipt_copy',
    'apparel_order_staff',
    'kitchen_order_staff',
    'raffle_staff',
    'receipt_copy',
    'contact',
    'event_song_requests',
    'spin_wheel_winners'
  ));
insert into public.notification_recipients (event_type, email, sort_order)
select 'spin_wheel_winners', v.email, v.sort_order
from (values ('ndcc.secretary1@gmail.com', 10), ('ndsc.cricket@gmail.com', 20)) as v(email, sort_order)
where not exists (
  select 1 from public.notification_recipients r
  where r.event_type = 'spin_wheel_winners' and lower(r.email) = v.email
);

notify pgrst, 'reload schema';
commit;
