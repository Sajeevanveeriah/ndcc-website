'use client';

import { useSearchParams } from 'next/navigation';

// Season selection for client fantasy views: ?season= slug from the shared
// SeasonSelector; empty means the current season (server default).
export function useSeasonParam() {
  const searchParams = useSearchParams();
  const season = searchParams?.get('season') || '';
  const query = season ? `?season=${encodeURIComponent(season)}` : '';
  return { season, query };
}
