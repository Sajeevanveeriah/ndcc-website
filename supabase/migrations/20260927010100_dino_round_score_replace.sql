-- Replace one round's Dino Coach manager scores in a single transaction:
-- upsert the recalculated rows and delete rows for managers who are no longer
-- scored (for example a deleted or deactivated team), so a recalculation never
-- leaves stale points behind or half-applies.
--
-- Additive: new function only. app/api/admin/fantasy/scores/route.ts falls back
-- to its previous upsert (plus a stale-row delete) when this function is absent.
--
-- Rollback:
-- begin;
-- drop function if exists public.replace_dino_coach_round_scores(uuid, uuid, jsonb);
-- commit;
begin;
set local lock_timeout = '3s';

create or replace function public.replace_dino_coach_round_scores(target_season_id uuid, target_round_id uuid, score_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  saved integer := 0;
begin
  if score_rows is null or jsonb_typeof(score_rows) <> 'array' then
    raise exception 'Score rows must be a list.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.fantasy_rounds r where r.id = target_round_id and r.season_id = target_season_id) then
    raise exception 'That round is not part of the selected season.' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dino-round-scores:' || target_round_id::text, 0));

  delete from public.fantasy_manager_round_scores s
  where s.season_id = target_season_id
    and s.round_id = target_round_id
    and not exists (
      select 1 from jsonb_array_elements(score_rows) item
      where (item->>'manager_id')::uuid = s.manager_id
    );

  insert into public.fantasy_manager_round_scores (manager_id, season_id, round_id, squad_id, total_points, transfer_penalty, net_points, calculated_at)
  select (item->>'manager_id')::uuid,
    target_season_id,
    target_round_id,
    nullif(item->>'squad_id', '')::uuid,
    coalesce((item->>'total_points')::numeric, 0),
    coalesce((item->>'transfer_penalty')::integer, 0),
    coalesce((item->>'net_points')::numeric, 0),
    now()
  from jsonb_array_elements(score_rows) item
  on conflict (manager_id, season_id, round_id) do update
    set squad_id = excluded.squad_id,
      total_points = excluded.total_points,
      transfer_penalty = excluded.transfer_penalty,
      net_points = excluded.net_points,
      calculated_at = excluded.calculated_at;
  get diagnostics saved = row_count;
  return saved;
end;
$function$;

revoke all on function public.replace_dino_coach_round_scores(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_dino_coach_round_scores(uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
