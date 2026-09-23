-- Atomic public event registration with a start-time and capacity guard.
--
-- The public registration API (app/api/events/route.ts) calls this function
-- with the service role. It locks the event row so concurrent registrations
-- for the same event are serialised, refuses events that have already
-- started, and inserts the registration only if events.capacity (when set)
-- still has room. Registrations whose payment_status is cancelled, failed,
-- refunded or expired do not consume capacity.
--
-- The API falls back to its application-level check when this function is
-- missing (PGRST202 / 42883), so application and migration deploy order do
-- not matter.
--
-- Rollback:
--   drop function if exists public.ndcc_register_event_attendee(uuid, text, text, text, integer, text, text, uuid);
--   notify pgrst, 'reload schema';

begin;

create or replace function public.ndcc_register_event_attendee(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_quantity integer,
  p_payment_status text,
  p_payment_reference text,
  p_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  select e.id, e.date, e.capacity, e.published
    into v_event
    from public.events e
    where e.id = p_event_id
    for update;

  if not found or v_event.published is not true then
    raise exception 'Event registration unavailable: event not found' using errcode = 'P0002';
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

notify pgrst, 'reload schema';

commit;
