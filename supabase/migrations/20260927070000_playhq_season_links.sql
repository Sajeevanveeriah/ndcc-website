-- PlayHQ integration mappings (WP7, additive only).
--
-- 1. club_season_playhq_seasons links one club season to one or more PlayHQ
--    seasons (PlayHQ registers the men's and women's competitions as separate
--    seasons). club_seasons.playhq_season_id is left untouched.
-- 2. teams.playhq_team_id links a CMS team card to its PlayHQ team (full UUID).
--
-- The existing club_season_playhq_grade_mappings and
-- club_season_playhq_team_mappings tables (20260712100000_club_seasons.sql)
-- become the source of truth for grades/teams once rows are saved from
-- /admin/season/playhq. Until any mapping row exists the public fixtures feed
-- keeps its automatic discovery behaviour, and the application code degrades
-- gracefully when this migration has not been applied yet.
--
-- Rollback:
--   begin;
--   drop index if exists public.teams_playhq_team_id_idx;
--   alter table public.teams drop column if exists playhq_team_id;
--   drop table if exists public.club_season_playhq_seasons;
--   notify pgrst, 'reload schema';
--   commit;

begin;
set local lock_timeout = '3s';

create table if not exists public.club_season_playhq_seasons (
  id uuid primary key default gen_random_uuid(),
  club_season_id uuid not null references public.club_seasons(id) on delete cascade,
  playhq_season_id text not null check (playhq_season_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  label text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_season_id, playhq_season_id)
);

create index if not exists club_season_playhq_seasons_season_idx
  on public.club_season_playhq_seasons(club_season_id, enabled, sort_order);

drop trigger if exists trg_club_season_playhq_seasons_updated_at on public.club_season_playhq_seasons;
create trigger trg_club_season_playhq_seasons_updated_at
before update on public.club_season_playhq_seasons
for each row execute function set_fantasy_updated_at();

alter table public.club_season_playhq_seasons enable row level security;
revoke all on public.club_season_playhq_seasons from public, anon, authenticated;
grant select, insert, update, delete on public.club_season_playhq_seasons to service_role;

alter table public.teams add column if not exists playhq_team_id text
  constraint teams_playhq_team_id_format check (playhq_team_id is null or playhq_team_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
create index if not exists teams_playhq_team_id_idx on public.teams(playhq_team_id) where playhq_team_id is not null;

notify pgrst, 'reload schema';
commit;
