-- The audit table records created_at and published_at; it has no calculated_at
-- column. Remove that stale conflict-update assignment from both functions.
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
    definition:=regexp_replace(definition,',calculated_at\s*=\s*NOW\(\)', '', 'gi');
    IF position('calculated_at' IN lower(definition))>0 THEN
      RAISE EXCEPTION 'Could not remove calculated_at from %.',function_name;
    END IF;
    EXECUTE definition;
  END LOOP;
END;
$$;
