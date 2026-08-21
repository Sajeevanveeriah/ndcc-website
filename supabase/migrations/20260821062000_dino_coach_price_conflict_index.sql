-- The atomic price RPC uses a single conflict target for both opening prices
-- (NULL effective round) and later round prices. PostgreSQL can infer that
-- target only from an all-row NULLS NOT DISTINCT index, so add the equivalent
-- full invariant alongside the earlier partial indexes.
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_player_prices_season_player_round_all_uniq
  ON public.fantasy_player_prices(season_id,player_id,effective_round_id) NULLS NOT DISTINCT;
