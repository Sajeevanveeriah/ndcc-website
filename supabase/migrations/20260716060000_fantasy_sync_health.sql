-- Explicit per-season PlayHQ sync health record (2026/27 season readiness).
--
-- One row per fantasy season, maintained by the orchestrator on every run.
-- Gives the CMS a stable place to read discovery/import health without
-- reconstructing it from job rows, and gives the non-empty-sync invariant a
-- durable diagnostic trail (raw entries vs queued games).
--
-- Rollback: drop table public.fantasy_sync_health;

create table if not exists public.fantasy_sync_health (
  season_id uuid primary key references public.fantasy_seasons(id) on delete cascade,
  last_successful_discovery timestamptz,
  last_successful_game_import timestamptz,
  raw_entries integer not null default 0,
  queued_games integer not null default 0,
  processed_games integer not null default 0,
  matched_players integer not null default 0,
  ambiguous_players integer not null default 0,
  failed_games integer not null default 0,
  last_error text,
  next_retry_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.fantasy_sync_health enable row level security;
-- Server-only: read via the authenticated admin API, written by the
-- orchestrator with the service role.

notify pgrst, 'reload schema';
