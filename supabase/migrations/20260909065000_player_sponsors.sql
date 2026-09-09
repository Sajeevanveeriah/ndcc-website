-- Dedicated player partnerships; no sample or historical data is published.
create table public.player_sponsors (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (length(trim(player_name)) between 1 and 160),
  sponsor_name text not null check (length(trim(sponsor_name)) between 1 and 160),
  player_image_url text not null default '',
  logo_url text not null default '',
  website text not null default '',
  sort_order integer not null default 0 check (sort_order between -100000 and 100000),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.player_sponsors enable row level security;
revoke all on public.player_sponsors from anon, authenticated;
grant select on public.player_sponsors to anon, authenticated;
grant all on public.player_sponsors to service_role;
create policy "Public active player sponsors" on public.player_sponsors
  for select to anon, authenticated using (active = true);
create index player_sponsors_public_order on public.player_sponsors (sort_order, player_name) where active;
notify pgrst, 'reload schema';
