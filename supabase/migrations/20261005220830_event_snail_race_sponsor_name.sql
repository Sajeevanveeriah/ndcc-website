-- Snail racing: each sponsored race is named after its sponsor (for example
-- "The Jack Elliott Stakes"). Store the sponsor name a buyer gives with their
-- race sponsorship. The 9-argument function stays as a wrapper so the
-- previous application release keeps working until the new one is deployed.
--
-- Rollback (after no sponsor names need keeping):
--   drop function if exists public.ndcc_register_event_snail_entry(uuid, text, text, text, text, text, uuid, jsonb, integer, text);
--   re-apply public.ndcc_register_event_snail_entry(uuid, text, text, text, text, text, uuid, jsonb, integer)
--     from 20261005095114_event_snail_racing.sql;
--   alter table public.event_registrations drop column if exists race_sponsor_name;
begin;
set local lock_timeout = '3s';

alter table public.event_registrations add column if not exists race_sponsor_name text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_registrations_race_sponsor_name_check'
                 and conrelid = 'public.event_registrations'::regclass) then
    alter table public.event_registrations add constraint event_registrations_race_sponsor_name_check
      check (race_sponsor_name is null or char_length(race_sponsor_name) between 1 and 40);
  end if;
end $$;
comment on column public.event_registrations.race_sponsor_name is
  'Snail racing: sponsor name for the races sponsored in this order; each race is named "The <sponsor> Stakes".';

create or replace function public.ndcc_register_event_snail_entry(
  p_event_id uuid, p_name text, p_email text, p_phone text,
  p_payment_status text, p_payment_reference text, p_order_id uuid,
  p_snail_entries jsonb, p_race_sponsorships integer, p_race_sponsor_name text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_event record;
  v_snail jsonb;
  v_snail_name text;
  v_player_name text;
  v_count integer;
  v_sponsor text;
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
  v_sponsor := nullif(btrim(coalesce(p_race_sponsor_name, '')), '');
  if v_sponsor is not null and char_length(v_sponsor) > 40 then
    raise exception 'Invalid race sponsor name' using errcode = '22023';
  end if;
  if p_race_sponsorships = 0 then v_sponsor := null; end if;
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
    snail_entries, race_sponsorships, race_sponsor_name
  ) values (
    p_event_id, p_name, p_email, p_phone, greatest(v_count, 1), p_payment_status, p_payment_reference, p_order_id,
    case when v_count > 0 then p_snail_entries end, p_race_sponsorships, v_sponsor
  )
  returning id into v_registration_id;

  return v_registration_id;
end;
$$;
revoke all on function public.ndcc_register_event_snail_entry(uuid, text, text, text, text, text, uuid, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.ndcc_register_event_snail_entry(uuid, text, text, text, text, text, uuid, jsonb, integer, text) to service_role;

-- Previous signature: same behaviour, no sponsor name.
create or replace function public.ndcc_register_event_snail_entry(
  p_event_id uuid, p_name text, p_email text, p_phone text,
  p_payment_status text, p_payment_reference text, p_order_id uuid,
  p_snail_entries jsonb, p_race_sponsorships integer
) returns uuid
language sql security definer set search_path = '' as $$
  select public.ndcc_register_event_snail_entry(
    p_event_id, p_name, p_email, p_phone, p_payment_status, p_payment_reference, p_order_id,
    p_snail_entries, p_race_sponsorships, null::text);
$$;
revoke all on function public.ndcc_register_event_snail_entry(uuid, text, text, text, text, text, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.ndcc_register_event_snail_entry(uuid, text, text, text, text, text, uuid, jsonb, integer) to service_role;

notify pgrst, 'reload schema';
commit;
