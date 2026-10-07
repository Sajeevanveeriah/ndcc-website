import SafeImage from '@/components/common/SafeImage';
import { Trophy } from 'lucide-react';
import { WINNER_CATEGORY_LABELS, formatClubDate } from '@/lib/match-day';
import type { PublicWinner } from '@/lib/server/match-day';

const trophy = <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-muted text-gold-600 dark:text-gold-300" aria-hidden="true"><Trophy className="h-6 w-6" /></span>;

export default function WinnerCard({ winner }: { winner: PublicWinner }) {
  return <article className="flex gap-4 rounded-xl border border-edge-subtle bg-surface-card p-4 shadow-sm">
    {winner.image_url
      ? <SafeImage src={winner.image_url} alt={winner.image_alt} width={96} height={96} fallback={trophy} className="h-20 w-20 shrink-0 rounded-lg object-cover sm:h-24 sm:w-24" />
      : trophy}
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">{WINNER_CATEGORY_LABELS[winner.category]} · {formatClubDate(winner.draw_date)}</p>
      <h3 className="mt-1 font-display text-lg font-bold text-content-primary">{winner.title}</h3>
      <p className="text-content-primary"><span className="font-semibold">{winner.display_name}</span>{winner.prize ? ` - ${winner.prize}` : ''}</p>
      {winner.sponsor_name && <p className="text-sm text-content-secondary">Sponsored by {winner.sponsor_name}</p>}
      {winner.details && <p className="mt-1 whitespace-pre-line text-sm text-content-secondary">{winner.details}</p>}
    </div>
  </article>;
}
