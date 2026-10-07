import { FileText } from 'lucide-react';
import { formatClubDate } from '@/lib/match-day';
import type { PublicTeamSheet } from '@/lib/server/match-day';

/** One side's published team for a match, as accessible text (any PDF is an extra download). */
export default function TeamSheetCard({ sheet, headingLevel = 'h3' }: { sheet: PublicTeamSheet; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel;
  const starters = sheet.players.filter((player) => !player.twelfth);
  const twelfth = sheet.players.filter((player) => player.twelfth);
  const details = [sheet.round_label, sheet.opponent && `v ${sheet.opponent}`].filter(Boolean).join(' · ');
  const when = [formatClubDate(sheet.match_date), sheet.start_time].filter(Boolean).join(', ');
  return <article className="rounded-xl border border-edge-subtle bg-surface-card p-5 shadow-sm">
    <Heading className="font-display text-xl font-bold text-content-primary">{sheet.team_name}</Heading>
    {details && <p className="mt-1 font-semibold text-content-secondary">{details}</p>}
    <p className="mt-1 text-sm text-content-muted">{when}{sheet.venue ? ` · ${sheet.venue}` : ''}</p>
    {starters.length > 0 && <ol className="mt-4 grid gap-x-6 gap-y-1 text-content-primary sm:grid-cols-2">
      {starters.map((player, index) => <li key={`${player.name}-${index}`} className="flex gap-2">
        <span className="w-6 shrink-0 text-right text-content-muted">{index + 1}.</span>
        <span>{player.name}{player.captain && <abbr title="Captain" className="ml-1 font-semibold no-underline">(c)</abbr>}{player.wicketkeeper && <abbr title="Wicketkeeper" className="ml-1 font-semibold no-underline">(wk)</abbr>}</span>
      </li>)}
    </ol>}
    {twelfth.length > 0 && <p className="mt-2 text-sm text-content-secondary">12th: {twelfth.map((player) => player.name).join(', ')}</p>}
    {sheet.notes && <p className="mt-3 whitespace-pre-line text-sm text-content-secondary">{sheet.notes}</p>}
    {sheet.document_url && <a href={sheet.document_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-content-blue underline underline-offset-4">
      <FileText className="h-4 w-4" aria-hidden="true" /> Team sheet (PDF)<span className="sr-only"> for {sheet.team_name}, opens in a new tab</span>
    </a>}
  </article>;
}
