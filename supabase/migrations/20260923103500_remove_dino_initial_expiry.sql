-- Remove registration expiry without changing manual account controls or consent.
-- Keep legacy timestamps as history. Rollback: redeploy the previous application
-- and restore the previous definitions/defaults from migration history if needed.
BEGIN;
DO $$
DECLARE fn record; definition text; revised text; changed_count integer := 0;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('save_dino_coach_squad','make_dino_coach_transfer','dino_market_guard')
  LOOP
    definition := pg_get_functiondef(fn.oid);
    revised := replace(definition,
      'AND (m.first_squad_completed_at IS NOT NULL OR now()<m.initial_squad_due_at)', '');
    IF revised=definition THEN RAISE EXCEPTION 'Expected expiry gate missing in %',fn.proname; END IF;
    revised := replace(revised,' or the initial squad deadline has passed','');
    EXECUTE revised;
    changed_count := changed_count+1;
  END LOOP;
  IF changed_count<>3 THEN RAISE EXCEPTION 'Expected three expiry enforcement functions'; END IF;

  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='admin_edit_dino_manager';
  revised := replace(definition,
    'initial_squad_due_at=case when (p_changes->>''reactivate'')::boolean and first_squad_completed_at is null then now()+interval ''5 days'' else initial_squad_due_at end,', '');
  IF revised IS NULL OR revised=definition THEN RAISE EXCEPTION 'Expected reactivation deadline assignment missing'; END IF;
  EXECUTE revised;
END $$;

ALTER TABLE public.fantasy_managers ALTER COLUMN initial_squad_due_at DROP NOT NULL;
ALTER TABLE public.fantasy_managers ALTER COLUMN initial_squad_due_at DROP DEFAULT;
ALTER TABLE public.fantasy_dino_settings ALTER COLUMN initial_reminders_enabled SET DEFAULT false;
UPDATE public.fantasy_dino_settings SET initial_reminders_enabled=false;
CREATE OR REPLACE FUNCTION public.queue_dino_initial_reminders()
RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RETURN 0;
END $$;
UPDATE public.fantasy_notification_jobs
SET cancelled_at=now(),lease_until=null
WHERE kind IN ('reminder','expired') AND sent_at IS NULL AND cancelled_at IS NULL;
COMMIT;
