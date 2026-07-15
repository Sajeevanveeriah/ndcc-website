import { redirect } from 'next/navigation';

// Friendly entry point: /match-reports lands on the publications archive
// pre-filtered to weekly match reports.
export const dynamic = 'force-dynamic';

export default function MatchReportsPage() {
  redirect('/publications?type=weekly_match_report');
}
