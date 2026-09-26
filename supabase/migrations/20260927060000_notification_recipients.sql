-- CMS-managed notification recipients (WP6a).
-- Seeds EXACTLY the recipients that were hardcoded in the application (see
-- lib/notification-recipients-fallback.ts), so email routing is identical
-- after deploy. Administrators manage the list at /admin/notifications.
--
-- Rollback (the application falls back to the hardcoded lists when this
-- table is missing, so dropping it is safe):
--   begin;
--   drop table if exists public.notification_recipients;
--   drop function if exists public.notification_recipients_touch_updated_at();
--   notify pgrst, 'reload schema';
--   commit;
begin;
set local lock_timeout = '3s';

create table public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'dino_registration_copy',
    'dino_receipt_copy',
    'apparel_order_staff',
    'kitchen_order_staff',
    'raffle_staff',
    'receipt_copy',
    'contact'
  )),
  email text not null check (
    char_length(email) <= 254
    and email = lower(btrim(email))
    and email ~ '^[^[:space:]@<>,;]+@[^[:space:]@<>,;]+\.[^[:space:]@<>,;]+$'
  ),
  name text null check (name is null or char_length(name) between 1 and 120),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index notification_recipients_event_email_key
  on public.notification_recipients (event_type, lower(email));

create or replace function public.notification_recipients_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notification_recipients_touch_updated_at
  before update on public.notification_recipients
  for each row execute function public.notification_recipients_touch_updated_at();

alter table public.notification_recipients enable row level security;
revoke all on public.notification_recipients from public, anon, authenticated;
grant select, insert, update, delete on public.notification_recipients to service_role;
revoke all on function public.notification_recipients_touch_updated_at() from public, anon, authenticated;

insert into public.notification_recipients (event_type, email, sort_order) values
  ('dino_registration_copy', 'sajeevanveeriah@gmail.com', 10),
  ('dino_receipt_copy', 'sajeevanveeriah@gmail.com', 10),
  ('apparel_order_staff', 'ndcc.secretary1@gmail.com', 10),
  ('apparel_order_staff', 'joshwalker20695@gmail.com', 20),
  ('kitchen_order_staff', 'ndcc.secretary1@gmail.com', 10),
  ('kitchen_order_staff', 'ndcc.treasurer1@gmail.com', 20),
  ('raffle_staff', 'ndsc.cricket@gmail.com', 10),
  ('raffle_staff', 'ndcc.vicepres@gmail.com', 20),
  ('raffle_staff', 'ndcc.secretary1@gmail.com', 30),
  ('receipt_copy', 'ndcc.secretary1@gmail.com', 10),
  ('receipt_copy', 'ndsc.cricket@gmail.com', 20),
  ('contact', 'ndcc.secretary1@gmail.com', 10);

notify pgrst, 'reload schema';
commit;
