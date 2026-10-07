-- Weekly team sheets (selected sides, linked to Dino Coach players so
-- participants can see who is named) and club winners (player sponsor awards,
-- Dino Lotto, raffle/event and other winners). Additive only: no existing table
-- changes. No sample data is inserted; the committee enters every row.

create table public.team_sheets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete set null,
  team_name text not null check (length(trim(team_name)) between 1 and 120),
  match_date date not null,
  round_label text not null default '' check (length(round_label) <= 60),
  season_label text not null default '' check (length(season_label) <= 40),
  opponent text not null default '' check (length(opponent) <= 160),
  venue text not null default '' check (length(venue) <= 200),
  start_time text not null default '' check (length(start_time) <= 40),
  -- Ordered list: [{ "name": text, "fantasy_player_id": uuid|null, "captain": bool, "wicketkeeper": bool, "twelfth": bool }]
  players jsonb not null default '[]'::jsonb check (jsonb_typeof(players) = 'array' and jsonb_array_length(players) <= 20),
  notes text not null default '' check (length(notes) <= 2000),
  document_url text not null default '' check (length(document_url) <= 2048),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index team_sheets_public_order on public.team_sheets (match_date desc, team_name) where published;
create unique index team_sheets_team_date_unique on public.team_sheets (lower(team_name), match_date);

create table public.club_winners (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('player_sponsor_award', 'dino_lotto', 'raffle', 'event', 'other')),
  title text not null check (length(trim(title)) between 1 and 160),
  winner_name text not null check (length(trim(winner_name)) between 1 and 160),
  show_full_name boolean not null default false,
  prize text not null default '' check (length(prize) <= 200),
  details text not null default '' check (length(details) <= 1000),
  draw_date date not null,
  round_label text not null default '' check (length(round_label) <= 60),
  season_label text not null default '' check (length(season_label) <= 40),
  player_sponsor_id uuid references public.player_sponsors(id) on delete set null,
  sponsor_name text not null default '' check (length(sponsor_name) <= 160),
  image_url text not null default '' check (length(image_url) <= 2048),
  image_alt text not null default '' check (length(image_alt) <= 300),
  published boolean not null default false,
  published_at timestamptz,
  sort_order integer not null default 0 check (sort_order between -100000 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index club_winners_public_order on public.club_winners (draw_date desc, sort_order) where published;

create or replace function public.touch_updated_at_team_sheets_winners()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger team_sheets_touch before update on public.team_sheets
  for each row execute function public.touch_updated_at_team_sheets_winners();
create trigger club_winners_touch before update on public.club_winners
  for each row execute function public.touch_updated_at_team_sheets_winners();

alter table public.team_sheets enable row level security;
alter table public.club_winners enable row level security;
revoke all on public.team_sheets from anon, authenticated;
revoke all on public.club_winners from anon, authenticated;
grant all on public.team_sheets to service_role;
grant all on public.club_winners to service_role;
revoke all on function public.touch_updated_at_team_sheets_winners() from public, anon, authenticated;
-- Public reads go through the server (service role) and filter published rows;
-- no anon/authenticated policy is granted, so the browser cannot read drafts
-- or full winner names directly.

notify pgrst, 'reload schema';
