-- Song-request events: entry is by buying named songs, each charged at the
-- event's ticket_price. Existing events stay in 'tickets' mode unchanged.
--
-- Rollback (after no song entries need keeping):
--   drop function if exists public.ndcc_register_event_song_entry(uuid, text, text, text, text, text, uuid, jsonb);
--   alter table public.event_registrations drop column if exists song_requests;
--   alter table public.events drop column if exists registration_mode;
begin;
set local lock_timeout = '3s';

alter table public.events
  add column if not exists registration_mode text not null default 'tickets';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_registration_mode_check'
                 and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_registration_mode_check
      check (registration_mode in ('tickets', 'song_requests'));
  end if;
end $$;
comment on column public.events.registration_mode is
  'tickets: pay ticket_price per ticket. song_requests: entry by buying named songs at ticket_price each.';

alter table public.event_registrations
  add column if not exists song_requests jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_registrations_song_requests_check'
                 and conrelid = 'public.event_registrations'::regclass) then
    alter table public.event_registrations add constraint event_registrations_song_requests_check
      check (song_requests is null or (jsonb_typeof(song_requests) = 'array'
        and jsonb_array_length(song_requests) between 1 and 30));
  end if;
end $$;
comment on column public.event_registrations.song_requests is
  'Songs bought for a song-request event, in order: [{"title": text, "artist": text}].';

-- Registers one entrant with their songs atomically. Reuses the locked,
-- capacity-aware attendee function so closing and capacity rules stay in one place.
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
  select e.registration_mode into v_mode from public.events e where e.id = p_event_id;
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

  v_registration_id := public.ndcc_register_event_attendee(
    p_event_id, p_name, p_email, p_phone, 1, p_payment_status, p_payment_reference, p_order_id);
  update public.event_registrations set song_requests = p_song_requests where id = v_registration_id;
  return v_registration_id;
end;
$$;
revoke all on function public.ndcc_register_event_song_entry(uuid, text, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ndcc_register_event_song_entry(uuid, text, text, text, text, text, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
