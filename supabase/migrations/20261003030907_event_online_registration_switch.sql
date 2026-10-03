-- Per-event switch for online registration and payment.
--
-- Committee members choose, per event, whether people register and pay on the
-- website or the club handles it manually (for example song requests taken
-- as Facebook comments and paid at the bar). When the switch is off the event
-- page shows the details without a registration form, and the public
-- registration API refuses entries for it. Existing events stay online
-- (default true), so nothing changes until an administrator turns it off.
--
-- Rollback:
--   alter table public.events drop column if exists online_registration_enabled;
alter table public.events
  add column if not exists online_registration_enabled boolean not null default true;

comment on column public.events.online_registration_enabled is
  'When false the website takes no registrations or payments for this event; the club handles them manually.';
