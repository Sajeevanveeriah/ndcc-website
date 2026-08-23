export type RaffleVisibilityMode = 'hidden' | 'scheduled' | 'visible';

export type RaffleVisibilityRow = {
  active: boolean;
  public_visibility_mode: RaffleVisibilityMode | null;
  public_opens_at: string | null;
};

export function isRaffleVisibleAt(campaign: RaffleVisibilityRow | null | undefined, at: Date = new Date()): boolean {
  if (!campaign?.active) return false;
  if (campaign.public_visibility_mode === 'visible') return true;
  if (campaign.public_visibility_mode !== 'scheduled' || !campaign.public_opens_at) return false;
  const opensAt = new Date(campaign.public_opens_at);
  return !Number.isNaN(opensAt.getTime()) && at.getTime() >= opensAt.getTime();
}

