import type { DinoSelectionBadge } from '@/lib/match-day';
import { namedLabel } from './useTeamSheetSelections';

/** "Named: 1st XI" chip for a player on this week's published team sheet. */
export default function NamedBadge({ badge }: { badge?: DinoSelectionBadge }) {
  if (!badge) return null;
  return <span className="ml-2 inline-flex items-center rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">{namedLabel(badge)}</span>;
}
