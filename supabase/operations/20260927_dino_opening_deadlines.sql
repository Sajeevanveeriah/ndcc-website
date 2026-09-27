-- Opening PlayHQ fixtures are Saturday 3 October 2026, fantasy week 1 for
-- the recorded 1 October season start. Keep the configured Saturday 11 am
-- Melbourne cutoff, accounting for the daylight-saving change on 4 October.
-- Rollback before scoring: restore week 1 to 2026-10-10T00:00:00Z and week 2
-- to 2026-10-17T00:00:00Z, only while deadlines still equal these new values.
BEGIN;
SET LOCAL lock_timeout = '3s';
DO $$
DECLARE changed integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fantasy_manager_round_scores WHERE season_id='75425550-0622-4ecb-87c4-69ab5ca40a53') THEN
    RAISE EXCEPTION 'Opening rounds already scored; review deadline correction.';
  END IF;
  UPDATE public.fantasy_rounds r SET deadline_at=x.new_deadline
  FROM (VALUES
    (1,'2026-10-10T00:00:00Z'::timestamptz, timestamp '2026-10-03 11:00:00' AT TIME ZONE 'Australia/Melbourne'),
    (2,'2026-10-17T00:00:00Z'::timestamptz, timestamp '2026-10-10 11:00:00' AT TIME ZONE 'Australia/Melbourne')
  ) AS x(round_number,old_deadline,new_deadline)
  WHERE r.season_id='75425550-0622-4ecb-87c4-69ab5ca40a53'
    AND r.round_number=x.round_number AND r.status='open' AND r.deadline_at=x.old_deadline;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>2 THEN RAISE EXCEPTION 'Opening deadlines changed; review before applying.'; END IF;
END;
$$;
COMMIT;
