-- PostgreSQL normalises the stored cast spelling to uppercase JSONB. Apply a
-- case-insensitive replacement and assert that each function is actually fixed.
DO $$
DECLARE function_name TEXT; definition TEXT;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'recalculate_dino_coach_applied_baseline',
    'apply_dino_coach_initial_price_recalculation'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=function_name;
    definition:=regexp_replace(definition,'''\[\]''::jsonb','ARRAY[]::NUMERIC[]','gi');
    IF position('ARRAY[]::NUMERIC[]' IN definition)=0 THEN
      RAISE EXCEPTION 'Could not correct recent_points in %.',function_name;
    END IF;
    EXECUTE definition;
  END LOOP;
END;
$$;
