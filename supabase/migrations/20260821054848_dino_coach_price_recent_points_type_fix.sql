-- Correct the empty recent-appearance value in the two atomic recalculation
-- functions. fantasy_price_calculations.recent_points is NUMERIC[], not JSONB.
DO $$
DECLARE
  function_name TEXT;
  definition TEXT;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'recalculate_dino_coach_applied_baseline',
    'apply_dino_coach_initial_price_recalculation'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=function_name;
    IF definition IS NULL OR position('''[]''::jsonb' IN lower(definition))=0 THEN
      RAISE EXCEPTION 'Expected JSONB empty recent_points expression was not found in %.',function_name;
    END IF;
    definition:=replace(definition,'''[]''::jsonb','ARRAY[]::NUMERIC[]');
    EXECUTE definition;
  END LOOP;
END;
$$;
