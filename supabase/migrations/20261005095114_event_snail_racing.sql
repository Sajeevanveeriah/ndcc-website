-- Snail racing events: entry is by buying named snails (snail name and
-- player name) at the event's ticket_price each, with optional race
-- sponsorships at race_sponsorship_price each. There is no sales cap: the
-- club adds races to fit the snails sold, so event capacity does not apply.
-- Existing events keep their registration mode unchanged.
--
-- Rollback (after no snail entries need keeping, and with no event still in
-- 'snail_race' mode):
--   drop function if exists public.ndcc_register_event_snail_entry(uuid, text, text, text, text, text, uuid, jsonb, integer);
--   re-apply public.ndcc_register_event_attendee from 20260927150000_event_registration_mode_lock.sql;
--   alter table public.events drop constraint if exists events_registration_mode_check;
--   alter table public.events add constraint events_registration_mode_check check (registration_mode in ('tickets', 'song_requests'));
--   alter table public.event_registrations drop column if exists snail_entries, drop column if exists race_sponsorships;
--   alter table public.events drop column if exists snail_race_count, drop column if exists snails_per_race,
--     drop column if exists race_sponsorship_price;
begin;
set local lock_timeout = '3s';

alter table public.events drop constraint if exists events_registration_mode_check;
alter table public.events add constraint events_registration_mode_check
  check (registration_mode in ('tickets', 'song_requests', 'snail_race'));
comment on column public.events.registration_mode is
  'tickets: pay ticket_price per ticket. song_requests: entry by buying named songs at ticket_price each. snail_race: buying named snails at ticket_price each, no sales cap.';

alter table public.events
  add column if not exists snail_race_count integer,
  add column if not exists snails_per_race integer,
  add column if not exists race_sponsorship_price numeric(10,2);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_snail_race_settings_check'
                 and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_snail_race_settings_check
      check ((snail_race_count is null or snail_race_count between 1 and 100)
        and (snails_per_race is null or snails_per_race between 1 and 20)
        and (race_sponsorship_price is null or race_sponsorship_price >= 0));
  end if;
end $$;
comment on column public.events.snail_race_count is 'Snail racing: planned number of races (shown on the event page). Races are added when more snails are sold.';
comment on column public.events.snails_per_race is 'Snail racing: snails in each race (shown on the event page and used for the race card export).';
comment on column public.events.race_sponsorship_price is 'Snail racing: price to sponsor one race. Null hides race sponsorship.';

alter table public.event_registrations
  add column if not exists snail_entries jsonb,
  add column if not exists race_sponsorships integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_registrations_snail_entries_check'
                 and conrelid = 'public.event_registrations'::regclass) then
    alter table public.event_registrations add constraint event_registrations_snail_entries_check
      check ((snail_entries is null or (jsonb_typeof(snail_entries) = 'array'
          and jsonb_array_length(snail_entries) between 1 and 200))
        and (race_sponsorships is null or race_sponsorships between 0 and 50));
  end if;
end $$;
comment on column public.event_registrations.snail_entries is
  'Snails bought for a snail racing event, in order: [{"snail_name": text, "player_name": text}].';
comment on column public.event_registrations.race_sponsorships is
  'Snail racing: races sponsored in this order.';

-- Ticket and song entries never land on a snail racing event.
create or replace function public.ndcc_register_event_attendee(
  p_event_id uuid, p_name text, p_email text, p_phone text, p_quantity integer,
  p_payment_status text, p_payment_reference text, p_order_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_event record;
  v_taken integer;
  v_registration_id uuid;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'Invalid event registration quantity' using errcode = '22023';
  end if;
  if p_payment_status is null or p_payment_status not in ('pending_bank_transfer', 'not_required') then
    raise exception 'Invalid event registration payment status' using errcode = '22023';
  end if;

  select e.id, e.date, e.capacity, e.published, e.registration_mode
    into v_event
    from public.events e
    where e.id = p_event_id
    for update;

  if not found or v_event.published is not true then
    raise exception 'Event registration unavailable: event not found' using errcode = 'P0002';
  end if;
  -- Song events take entries only through ndcc_register_event_song_entry.
  if v_event.registration_mode = 'song_requests'
     and coalesce(pg_catalog.current_setting('ndcc.song_entry', true), '') <> 'on' then
    raise exception 'Event registration unavailable: song-request event' using errcode = 'P0001';
  end if;
  -- Snail racing events take entries only through ndcc_register_event_snail_entry.
  if v_event.registration_mode = 'snail_race' then
    raise exception 'Event registration unavailable: snail racing event' using errcode = 'P0001';
  end if;
  if v_event.date <= pg_catalog.now() then
    raise exception 'Event registration closed: event has already started' using errcode = 'P0001';
  end if;

  if v_event.capacity is not null then
    select coalesce(sum(coalesce(r.quantity, 1)), 0)::integer
      into v_taken
      from public.event_registrations r
      where r.event_id = p_event_id
        and coalesce(r.payment_status, '') not in ('cancelled', 'failed', 'refunded', 'expired');
    if v_taken + p_quantity > v_event.capacity then
      raise exception 'Event registration capacity reached' using errcode = 'P0001';
    end if;
  end if;

  insert into public.event_registrations (
    event_id, name, email, phone, quantity, payment_status, payment_reference, order_id
  ) values (
    p_event_id, p_name, p_email, p_phone, p_quantity, p_payment_status, p_payment_reference, p_order_id
  )
  returning id into v_registration_id;

  return v_registration_id;
end;
$$;
revoke all on function public.ndcc_register_event_attendee(uuid, text, text, text, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.ndcc_register_event_attendee(uuid, text, text, text, integer, text, text, uuid) to service_role;

-- Registers one buyer's snails and race sponsorships atomically, under the
-- event-row lock so the mode cannot change mid-entry. No capacity check:
-- snail sales are unlimited.
create or replace function public.ndcc_register_event_snail_entry(
  p_event_id uuid, p_name text, p_email text, p_phone text,
  p_payment_status text, p_payment_reference text, p_order_id uuid,
  p_snail_entries jsonb, p_race_sponsorships integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_event record;
  v_snail jsonb;
  v_snail_name text;
  v_player_name text;
  v_count integer;
  v_registration_id uuid;
begin
  if p_payment_status is null or p_payment_status not in ('pending_bank_transfer', 'not_required') then
    raise exception 'Invalid event registration payment status' using errcode = '22023';
  end if;

  select e.id, e.date, e.published, e.registration_mode, e.race_sponsorship_price
    into v_event
    from public.events e
    where e.id = p_event_id
    for update;

  if not found or v_event.published is not true then
    raise exception 'Event registration unavailable: event not found' using errcode = 'P0002';
  end if;
  if v_event.registration_mode is distinct from 'snail_race' then
    raise exception 'Event registration unavailable: not a snail racing event' using errcode = 'P0001';
  end if;
  if v_event.date <= pg_catalog.now() then
    raise exception 'Event registration closed: event has already started' using errcode = 'P0001';
  end if;

  if p_snail_entries is null or jsonb_typeof(p_snail_entries) <> 'array'
     or jsonb_array_length(p_snail_entries) > 200 then
    raise exception 'Invalid snail entries' using errcode = '22023';
  end if;
  if p_race_sponsorships is null or p_race_sponsorships < 0 or p_race_sponsorships > 50 then
    raise exception 'Invalid race sponsorships' using errcode = '22023';
  end if;
  if p_race_sponsorships > 0 and v_event.race_sponsorship_price is null then
    raise exception 'Event registration unavailable: race sponsorship is not offered' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(p_snail_entries);
  if v_count + p_race_sponsorships < 1 then
    raise exception 'Invalid snail entries' using errcode = '22023';
  end if;
  for v_snail in select value from jsonb_array_elements(p_snail_entries) loop
    -- "is distinct from" so a missing key (null) is refused, not skipped.
    if jsonb_typeof(v_snail) is distinct from 'object'
       or jsonb_typeof(v_snail->'snail_name') is distinct from 'string'
       or jsonb_typeof(v_snail->'player_name') is distinct from 'string' then
      raise exception 'Invalid snail entries' using errcode = '22023';
    end if;
    v_snail_name := btrim(v_snail->>'snail_name');
    v_player_name := btrim(v_snail->>'player_name');
    if coalesce(char_length(v_snail_name), 0) < 1 or char_length(v_snail_name) > 24
       or coalesce(char_length(v_player_name), 0) < 1 or char_length(v_player_name) > 40 then
      raise exception 'Invalid snail entries' using errcode = '22023';
    end if;
  end loop;

  insert into public.event_registrations (
    event_id, name, email, phone, quantity, payment_status, payment_reference, order_id,
    snail_entries, race_sponsorships
  ) values (
    p_event_id, p_name, p_email, p_phone, greatest(v_count, 1), p_payment_status, p_payment_reference, p_order_id,
    case when v_count > 0 then p_snail_entries end, p_race_sponsorships
  )
  returning id into v_registration_id;

  return v_registration_id;
end;
$$;
revoke all on function public.ndcc_register_event_snail_entry(uuid, text, text, text, text, text, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.ndcc_register_event_snail_entry(uuid, text, text, text, text, text, uuid, jsonb, integer) to service_role;

notify pgrst, 'reload schema';
commit;
