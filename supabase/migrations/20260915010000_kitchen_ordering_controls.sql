-- Manual activation is explicit; the weekly schedule cannot enable ordering.
create table public.kitchen_ordering_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  open_day integer not null default 1 check (open_day between 1 and 4),
  open_time text not null default '00:00' check (open_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  close_day integer not null default 4 check (close_day between 1 and 4),
  close_time text not null default '10:00' check (close_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  updated_at timestamptz not null default now(),
  check (open_day < close_day or (open_day = close_day and open_time < close_time))
);
insert into public.kitchen_ordering_settings (id) values (true);
alter table public.kitchen_ordering_settings enable row level security;
revoke all on public.kitchen_ordering_settings from anon, authenticated;
grant select, update on public.kitchen_ordering_settings to service_role;
notify pgrst, 'reload schema';
