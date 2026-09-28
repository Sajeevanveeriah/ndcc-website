import 'server-only';
import { createServerClient } from '@/lib/supabase-server';

// Realised profit or loss from Dino Coach player sales (fantasy_dino_sales).
// Spending power = starting budget + realised profit - purchase cost of players held.
export async function getRealisedSaleProfit(managerId: string, seasonId: string): Promise<number> {
  const { data, error } = await createServerClient().rpc('dino_realised_sale_profit', { target_manager_id: managerId, target_season_id: seasonId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export function walletSummary(startingBudget: number, realisedProfit: number) {
  return { startingBudgetDinoDollars: startingBudget, realisedProfitDinoDollars: realisedProfit, spendingPowerDinoDollars: startingBudget + realisedProfit };
}

// Latest published price for each given player, whether or not they are still
// eligible: sales of ineligible owned players are recorded at this price too.
export async function getLatestPublishedPrices(seasonId: string, playerIds: string[]): Promise<Array<{ id: string; price_dino_dollars: number }>> {
  if (!playerIds.length) return [];
  const { data, error } = await createServerClient().from('fantasy_player_prices')
    .select('player_id,price_dino_dollars,created_at').eq('season_id', seasonId).in('player_id', playerIds)
    .not('published_at', 'is', null).gt('price_dino_dollars', 0).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const latest = new Map<string, number>();
  for (const row of data ?? []) if (!latest.has(row.player_id)) latest.set(row.player_id, Number(row.price_dino_dollars));
  return [...latest.entries()].map(([id, price_dino_dollars]) => ({ id, price_dino_dollars }));
}
