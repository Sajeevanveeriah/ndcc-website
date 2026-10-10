-- Dino Coach round-score catch-up: a stable, per-round "stats changed" stamp.
-- fantasy_import_batches.published_at is set when a batch becomes published
-- (orchestrator or admin), and fantasy_match_stats.changed_at whenever a stat
-- row is written (import, reconciliation approval, admin edit). A round needs
-- re-scoring when its newest published stat change is later than its newest
-- saved score. Unlike fantasy_seasons.last_playhq_sync_at, which every daily
-- sync advances, these stamps only move when the round's inputs move.
-- Existing rows are backfilled from created_at so nothing is re-scored just
-- because this migration ran.
-- Rollback:
--   drop trigger if exists fantasy_import_batches_published_at on public.fantasy_import_batches;
--   drop trigger if exists fantasy_match_stats_changed_at on public.fantasy_match_stats;
--   drop function if exists public.stamp_fantasy_import_batch_published_at();
--   drop function if exists public.stamp_fantasy_match_stat_changed_at();
--   alter table public.fantasy_import_batches drop column if exists published_at;
--   alter table public.fantasy_match_stats drop column if exists changed_at;
begin;
set local lock_timeout = '3s';

alter table public.fantasy_import_batches add column if not exists published_at timestamptz;
update public.fantasy_import_batches set published_at = created_at
  where status = 'published' and published_at is null;

alter table public.fantasy_match_stats add column if not exists changed_at timestamptz;
update public.fantasy_match_stats set changed_at = created_at where changed_at is null;
alter table public.fantasy_match_stats alter column changed_at set default now();
alter table public.fantasy_match_stats alter column changed_at set not null;

create or replace function public.stamp_fantasy_import_batch_published_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  return new;
end;
$function$;

create or replace function public.stamp_fantasy_match_stat_changed_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.changed_at := now();
  return new;
end;
$function$;

create or replace trigger fantasy_import_batches_published_at
  before insert or update of status on public.fantasy_import_batches
  for each row execute function public.stamp_fantasy_import_batch_published_at();

create or replace trigger fantasy_match_stats_changed_at
  before insert or update on public.fantasy_match_stats
  for each row execute function public.stamp_fantasy_match_stat_changed_at();

commit;
