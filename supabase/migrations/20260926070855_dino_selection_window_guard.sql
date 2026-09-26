SET LOCAL lock_timeout = '3s';
ALTER TABLE public.fantasy_dino_settings ADD COLUMN IF NOT EXISTS selection_window_enabled boolean NOT NULL DEFAULT false;
DO $migration$
DECLARE source text; revised text;
BEGIN
  SELECT pg_get_functiondef('public.dino_market_guard(uuid,uuid,uuid,boolean)'::regprocedure) INTO source;
  revised := replace(source,
    'IF transfer_only AND NOT public.dino_coach_transfer_window_open(sid,now())',
    'IF (transfer_only OR EXISTS (SELECT 1 FROM public.fantasy_dino_settings WHERE season_id=sid AND selection_window_enabled)) AND NOT public.dino_coach_transfer_window_open(sid,now())');
  IF revised = source THEN RAISE EXCEPTION 'Unexpected dino_market_guard definition; no changes applied.'; END IF;
  EXECUTE revised;
END $migration$;

-- Rollback, after reverting reader code:
-- UPDATE public.fantasy_dino_settings SET selection_window_enabled=false;
-- DO $rollback$
-- DECLARE source text;
-- BEGIN
--   SELECT pg_get_functiondef('public.dino_market_guard(uuid,uuid,uuid,boolean)'::regprocedure) INTO source;
--   EXECUTE replace(source,
--     'IF (transfer_only OR EXISTS (SELECT 1 FROM public.fantasy_dino_settings WHERE season_id=sid AND selection_window_enabled)) AND NOT public.dino_coach_transfer_window_open(sid,now())',
--     'IF transfer_only AND NOT public.dino_coach_transfer_window_open(sid,now())');
-- END $rollback$;
-- ALTER TABLE public.fantasy_dino_settings DROP COLUMN IF EXISTS selection_window_enabled;
