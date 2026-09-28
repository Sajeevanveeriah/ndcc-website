-- Dino Coach sales at market value (rules change requested by Saj, 28 September 2026).
-- Selling a player now returns their purchase cost plus any price movement since the
-- player's sale reference: profit from a price rise adds to the manager's spending
-- power and a price fall reduces it, so spending power can move above or below the
-- 15,000,000 starting budget.
--
-- Spending power = starting budget + realised sale profit - purchase cost of players held.
-- A sale never returns less than zero, so a loss is capped at the purchase cost.
--
-- The sale reference is the price that profit is measured from:
--   * players already held when this migration runs: their published price now, so
--     pre-season price corrections pay out nothing;
--   * players bought later: the price paid.
-- Retained players keep their reference, as they keep their purchase cost. CMS
-- corrections (ndcc.dino_admin_edit) never book sales.
BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.fantasy_squad_players ADD COLUMN sale_reference_dino_dollars bigint;

UPDATE public.fantasy_squad_players sp
SET sale_reference_dino_dollars = (SELECT p.price_dino_dollars FROM public.fantasy_player_prices p
  WHERE p.season_id=s.season_id AND p.player_id=sp.player_id AND p.published_at IS NOT NULL
  ORDER BY p.created_at DESC LIMIT 1)
FROM public.fantasy_squads s
WHERE s.id=sp.squad_id AND sp.sale_reference_dino_dollars IS NULL;
UPDATE public.fantasy_squad_players SET sale_reference_dino_dollars=purchase_price_dino_dollars
  WHERE sale_reference_dino_dollars IS NULL;

CREATE TABLE public.fantasy_dino_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL REFERENCES public.fantasy_managers(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.fantasy_rounds(id) ON DELETE SET NULL,
  squad_id uuid REFERENCES public.fantasy_squads(id) ON DELETE SET NULL,
  player_id uuid NOT NULL REFERENCES public.fantasy_players(id),
  purchase_price_dino_dollars bigint NOT NULL,
  sale_reference_dino_dollars bigint NOT NULL,
  sale_price_dino_dollars bigint NOT NULL CHECK (sale_price_dino_dollars > 0),
  -- A sale is never worth less than nothing: the loss is capped at the purchase cost.
  profit_dino_dollars bigint GENERATED ALWAYS AS (GREATEST(sale_price_dino_dollars - sale_reference_dino_dollars, -purchase_price_dino_dollars)) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fantasy_dino_sales_manager_season_idx ON public.fantasy_dino_sales(manager_id, season_id);
ALTER TABLE public.fantasy_dino_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fantasy_dino_sales FROM anon, authenticated;
GRANT SELECT, INSERT ON public.fantasy_dino_sales TO service_role;
COMMENT ON TABLE public.fantasy_dino_sales IS
  'Dino Coach player sales. Realised profit (sale price - sale reference) adds to the manager''s spending power.';

CREATE FUNCTION public.dino_realised_sale_profit(target_manager_id uuid, target_season_id uuid)
RETURNS bigint LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(sum(profit_dino_dollars),0)::bigint FROM public.fantasy_dino_sales
  WHERE manager_id=target_manager_id AND season_id=target_season_id;
$$;
REVOKE ALL ON FUNCTION public.dino_realised_sale_profit(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dino_realised_sale_profit(uuid,uuid) TO service_role;

DO $migration$
DECLARE source text; revised text;
  old_check text := '  IF actual_budget>cfg.budget_dino_dollars OR actual_budget<>target_budget_dino_dollars THEN';
  new_check text := '  -- Players in the previous saved squad but not in this selection are sold at their current published price.
  IF prior_squad_id IS NOT NULL AND coalesce(current_setting(''ndcc.dino_admin_edit'',true),'''')<>''on'' THEN
    INSERT INTO public.fantasy_dino_sales(season_id,manager_id,round_id,squad_id,player_id,purchase_price_dino_dollars,sale_reference_dino_dollars,sale_price_dino_dollars)
    SELECT target_season_id,target_manager_id,target_round_id,prior_squad_id,owned.player_id,owned.purchase_price_dino_dollars,
      coalesce(owned.sale_reference_dino_dollars,owned.purchase_price_dino_dollars),price.price_dino_dollars
    FROM public.fantasy_squad_players owned
    JOIN LATERAL (SELECT p.price_dino_dollars FROM public.fantasy_player_prices p
      WHERE p.season_id=target_season_id AND p.player_id=owned.player_id AND p.published_at IS NOT NULL AND p.price_dino_dollars>0
      ORDER BY p.created_at DESC LIMIT 1) price ON TRUE
    WHERE owned.squad_id=prior_squad_id AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(selected_players) item
      WHERE (item->>''player_id'')::uuid=owned.player_id);
  END IF;
  IF actual_budget>cfg.budget_dino_dollars+public.dino_realised_sale_profit(target_manager_id,target_season_id) OR actual_budget<>target_budget_dino_dollars THEN';
  -- Manager saves compare with their latest saved squad, as save_dino_coach_squad_v2, dino_market_action
  -- and the squad API do, so retained costs, references and sales share one source. CMS corrections of a
  -- past round keep using that round's own squad, which the admin API prices.
  old_prior text := 'ORDER BY (round_id IS NOT DISTINCT FROM target_round_id) DESC,created_at DESC LIMIT 1;';
  new_prior text := 'ORDER BY (coalesce(current_setting(''ndcc.dino_admin_edit'',true),'''')=''on'' AND round_id IS NOT DISTINCT FROM target_round_id) DESC,created_at DESC LIMIT 1;';
  old_retain text := 'item || jsonb_build_object(''retained_cost'',owned.purchase_price_dino_dollars)';
  new_retain text := 'item || jsonb_build_object(''retained_cost'',owned.purchase_price_dino_dollars,''retained_reference'',owned.sale_reference_dino_dollars)';
  old_columns text := 'slot_key,assigned_role,purchase_price_dino_dollars)';
  new_columns text := 'slot_key,assigned_role,purchase_price_dino_dollars,sale_reference_dino_dollars)';
  old_values text := 'item->>''slot_key'',item->>''assigned_role'',COALESCE((item->>''retained_cost'')::bigint,p.price_dino_dollars)';
  new_values text := 'item->>''slot_key'',item->>''assigned_role'',COALESCE((item->>''retained_cost'')::bigint,p.price_dino_dollars),
    COALESCE((item->>''retained_reference'')::bigint,(item->>''retained_cost'')::bigint,p.price_dino_dollars)';
BEGIN
  SELECT pg_get_functiondef('public.save_dino_coach_squad(uuid,uuid,uuid,text,bigint,jsonb)'::regprocedure) INTO source;
  IF strpos(source, old_check)=0 OR strpos(source, old_prior)=0 OR strpos(source, old_retain)=0 OR strpos(source, old_columns)=0 OR strpos(source, old_values)=0 THEN
    RAISE EXCEPTION 'Unexpected save_dino_coach_squad definition; no changes applied.';
  END IF;
  revised := replace(replace(replace(replace(replace(source, old_check, new_check), old_prior, new_prior), old_retain, new_retain), old_columns, new_columns), old_values, new_values);
  EXECUTE revised;
END $migration$;

COMMIT;

-- Rollback (after reverting the application): restore the pre-change definition by
-- reversing the five replacements above, then
--   DROP FUNCTION public.dino_realised_sale_profit(uuid,uuid);
--   DROP TABLE public.fantasy_dino_sales;
--   ALTER TABLE public.fantasy_squad_players DROP COLUMN sale_reference_dino_dollars;
-- Purchase costs are never changed by this migration, so held squads stay valid.
