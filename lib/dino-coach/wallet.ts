export type WalletPick = { playerId: string; purchasePriceDinoDollars: number };
export type WalletPrice = { id: string; price_dino_dollars: number };
export type OwnedPlayer = { playerId: string; purchasePriceDinoDollars: number; saleReferenceDinoDollars: number };

// Retained players keep their paid cost. Buying uses the published price.
// Spending power is the starting budget plus realised sale profit, so the
// budget passed here may be above or below the starting budget.
export function squadWallet(budget: number, picks: WalletPick[], prices: WalletPrice[]) {
  const spent = picks.reduce((sum, pick) => sum + pick.purchasePriceDinoDollars, 0);
  const marketValue = picks.reduce((sum, pick) => sum + (prices.find((p) => p.id === pick.playerId)?.price_dino_dollars ?? pick.purchasePriceDinoDollars), 0);
  return { budget, spent, remaining: budget - spent, marketValue };
}

// A sale returns the purchase cost plus the price movement since the player's
// sale reference (the price when bought, or when sales at market value began).
export function saleValue(purchasePrice: number, saleReference: number, currentPrice: number) {
  return purchasePrice + currentPrice - saleReference;
}

// Profit or loss that unsaved removals of owned players will realise on save.
export function pendingSaleProfit(owned: OwnedPlayer[], selectedPlayerIds: Iterable<string>, prices: WalletPrice[]) {
  const selected = new Set(selectedPlayerIds);
  return owned.reduce((sum, player) => {
    if (selected.has(player.playerId)) return sum;
    const price = prices.find((p) => p.id === player.playerId)?.price_dino_dollars;
    return price === undefined ? sum : sum + price - player.saleReferenceDinoDollars;
  }, 0);
}

export function marketPreview(remaining: number, refund: number, purchase: number) {
  if (![remaining, refund, purchase].every(Number.isSafeInteger) || refund < 0 || purchase < 0) throw new Error('Invalid Dino Dollar amount.');
  return remaining + refund - purchase;
}
