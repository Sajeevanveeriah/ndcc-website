-- Check the registration type under the event-row lock, so a concurrent
-- admin switch between tickets and song requests cannot store the wrong kind
-- of entry. The song wrapper takes the lock before checking the mode and marks
-- the transaction; the attendee function refuses song events unless marked.
-- Rollback: re-apply 20260923054733_event_registration_capacity_guard.sql and
-- 20260927140000_event_song_requests.sql.
begin;
set local lock_timeout = '3s';

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

create or replace function public.ndcc_register_event_song_entry(
  p_event_id uuid, p_name text, p_email text, p_phone text,
  p_payment_status text, p_payment_reference text, p_order_id uuid, p_song_requests jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_mode text;
  v_song jsonb;
  v_title text;
  v_artist text;
  v_registration_id uuid;
begin
  -- Lock the event row first; the mode cannot change until this commits.
  select e.registration_mode into v_mode from public.events e where e.id = p_event_id for update;
  if v_mode is distinct from 'song_requests' then
    raise exception 'Event registration unavailable: not a song-request event' using errcode = 'P0001';
  end if;
  if p_song_requests is null or jsonb_typeof(p_song_requests) <> 'array'
     or jsonb_array_length(p_song_requests) < 1 or jsonb_array_length(p_song_requests) > 30 then
    raise exception 'Invalid song requests' using errcode = '22023';
  end if;
  for v_song in select value from jsonb_array_elements(p_song_requests) loop
    if jsonb_typeof(v_song) <> 'object' or jsonb_typeof(v_song->'title') <> 'string'
       or (v_song ? 'artist' and jsonb_typeof(v_song->'artist') <> 'string') then
      raise exception 'Invalid song requests' using errcode = '22023';
    end if;
    v_title := btrim(v_song->>'title');
    v_artist := coalesce(btrim(v_song->>'artist'), '');
    if char_length(v_title) < 1 or char_length(v_title) > 100 or char_length(v_artist) > 80 then
      raise exception 'Invalid song requests' using errcode = '22023';
    end if;
  end loop;

  perform pg_catalog.set_config('ndcc.song_entry', 'on', true);
  v_registration_id := public.ndcc_register_event_attendee(
    p_event_id, p_name, p_email, p_phone, 1, p_payment_status, p_payment_reference, p_order_id);
  perform pg_catalog.set_config('ndcc.song_entry', '', true);
  update public.event_registrations set song_requests = p_song_requests where id = v_registration_id;
  return v_registration_id;
end;
$$;
revoke all on function public.ndcc_register_event_song_entry(uuid, text, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ndcc_register_event_song_entry(uuid, text, text, text, text, text, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
