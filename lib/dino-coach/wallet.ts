export type WalletPick = { playerId: string; purchasePriceDinoDollars: number };
export type WalletPrice = { id: string; price_dino_dollars: number };

// Retained players keep their paid cost. Selling refunds that cost; buying uses
// the published price. Market value never silently adds or removes cash.
export function squadWallet(budget: number, picks: WalletPick[], prices: WalletPrice[]) {
  const spent = picks.reduce((sum, pick) => sum + pick.purchasePriceDinoDollars, 0);
  const marketValue = picks.reduce((sum, pick) => sum + (prices.find((p) => p.id === pick.playerId)?.price_dino_dollars ?? pick.purchasePriceDinoDollars), 0);
  return { budget, spent, remaining: budget - spent, marketValue };
}
export function marketPreview(remaining: number, refund: number, purchase: number) {
  if (![remaining, refund, purchase].every(Number.isSafeInteger) || refund < 0 || purchase < 0) throw new Error('Invalid Dino Dollar amount.');
  return remaining + refund - purchase;
}
