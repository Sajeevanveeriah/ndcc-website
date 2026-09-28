-- The section minimum was removed by 20260928140000. After a full replay no
-- validator, score trigger, save-RPC check or settings flag may remain.
DO $$
BEGIN
  IF to_regprocedure('public.validate_dino_women_selection(uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Section validator still installed';
  END IF;
  IF to_regprocedure('public.check_dino_score_women_selection()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='enforce_dino_score_women_selection') THEN
    RAISE EXCEPTION 'Section score trigger still installed';
  END IF;
  IF strpos(pg_get_functiondef('public.save_dino_coach_squad(uuid,uuid,uuid,text,bigint,jsonb)'::regprocedure),'women')>0 THEN
    RAISE EXCEPTION 'Squad save still checks the section rule';
  END IF;
  IF strpos(pg_get_functiondef('public.save_dino_coach_squad(uuid,uuid,uuid,text,bigint,jsonb)'::regprocedure),'invalid slot or player')=0 THEN
    RAISE EXCEPTION 'Normal squad validation was lost';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fantasy_dino_settings'
             AND column_name IN ('women_rule_enabled','women_update_deadline')) THEN
    RAISE EXCEPTION 'Section rule settings columns still present';
  END IF;
END $$;
