import TeamSheetCard from '@/components/match-day/TeamSheetCard';
import { formatClubDate, groupTeamSheetsByRound } from '@/lib/match-day';
import type { PublicTeamSheet } from '@/lib/server/match-day';

/** Team sheets as a gallery: one section per round, one card per grade folder or team. */
export default function TeamSheetRounds({ sheets, headingLevel = 'h2' }: { sheets: PublicTeamSheet[]; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel;
  const cardHeading = headingLevel === 'h2' ? 'h3' : 'h4';
  return <div className="space-y-12">
    {groupTeamSheetsByRound(sheets).map((round) => {
      const id = `round-${round.key.replace(/[^a-z0-9]+/gi, '-')}`;
      return <section key={round.key} aria-labelledby={id} className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-edge-subtle pb-2">
          <Heading id={id} className="font-display text-2xl font-bold text-content-primary">{round.title}</Heading>
          <p className="text-sm text-content-muted">{[round.season_label, round.dates.map(formatClubDate).join(' and ')].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {round.sheets.map((sheet) => <TeamSheetCard key={sheet.id} sheet={sheet} headingLevel={cardHeading} />)}
        </div>
      </section>;
    })}
  </div>;
}
