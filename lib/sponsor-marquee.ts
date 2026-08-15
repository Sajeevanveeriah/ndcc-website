export type SponsorMarqueeSpeed = 'slow' | 'very_slow';

export function normaliseSponsorMarqueeSpeed(value: unknown): SponsorMarqueeSpeed {
  return value === 'very_slow' ? 'very_slow' : 'slow';
}

export function sponsorMarqueeDurationSeconds(speed: unknown, sponsorCount: number): number {
  const secondsPerSponsor = normaliseSponsorMarqueeSpeed(speed) === 'very_slow' ? 7 : 5;
  return Math.max(60, Math.max(1, sponsorCount) * secondsPerSponsor);
}
