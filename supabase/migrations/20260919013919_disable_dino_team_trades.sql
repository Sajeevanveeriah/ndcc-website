BEGIN;
-- Preserve past records while making all direct team exchanges unavailable.
CREATE OR REPLACE FUNCTION public.dino_trade_action(mid uuid,sid uuid,rid uuid,action text,offer_id uuid DEFAULT NULL,other_id uuid DEFAULT NULL,out_id uuid DEFAULT NULL,in_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'Inter-team trades are no longer available. Sell players back to the player pool instead.';
END $$;
REVOKE ALL ON FUNCTION public.dino_trade_action(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
UPDATE public.fantasy_trade_offers SET status='cancelled',resolved_at=now() WHERE status='pending';
UPDATE public.fantasy_dino_settings SET rules_version='2026-27-rev06'
WHERE season_id IN (SELECT id FROM public.fantasy_seasons WHERE is_current);
COMMIT;
-- Rollback: restore the previous application and function definition. Previously
-- cancelled offers must stay cancelled; new offers would require fresh consent.
