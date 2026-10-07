'use client';

import { useEffect, useState } from 'react';
import type { DinoSelectionBadge } from '@/lib/match-day';

/**
 * Players named on this week's published club team sheets (player id -> team).
 * Informational only: an empty map (nothing published, or the read failed)
 * simply shows no badges, and never blocks picking a squad.
 */
export function useTeamSheetSelections(): Record<string, DinoSelectionBadge> {
  const [selections, setSelections] = useState<Record<string, DinoSelectionBadge>>({});
  useEffect(() => {
    let active = true;
    fetch('/api/match-day/selections')
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (active && payload?.selections && typeof payload.selections === 'object') setSelections(payload.selections); })
      .catch(() => { /* badges are optional */ });
    return () => { active = false; };
  }, []);
  return selections;
}

export function namedLabel(badge: DinoSelectionBadge | undefined): string {
  return badge ? `Named: ${badge.team_name}${badge.round_label ? ` (${badge.round_label})` : ''}` : '';
}
