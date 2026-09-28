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
