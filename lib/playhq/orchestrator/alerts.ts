/* eslint-disable @typescript-eslint/no-explicit-any */
// Repeated-failure admin alerting for the fantasy PlayHQ orchestrator.
// Split out of lib/playhq/fantasy-orchestrator.ts (which re-exports the public API).
import 'server-only';
import { escapeEmailHtml, sendEmail, getContactEmailRecipients } from '@/lib/email';
import { ALERT_AFTER_FAILURES, ALERT_DEDUPE_MS, type SeasonRow, recordRun } from './shared';

/** Send a deduplicated admin alert after repeated failures for a season. */
export async function maybeAlertAdmins(supabase: any, invokedBy: string, season: SeasonRow, latestError: string) {
  if (!season.auto_sync_enabled || season.status !== 'active') return;
  const { data: recent } = await supabase
    .from('fantasy_sync_runs')
    .select('status, stage, created_at')
    .eq('season_id', season.id)
    .neq('stage', 'alert')
    .order('created_at', { ascending: false })
    .limit(ALERT_AFTER_FAILURES);
  const failures = (recent ?? []).filter((run: { status: string }) => run.status === 'error' || run.status === 'blocked');
  if (failures.length < ALERT_AFTER_FAILURES) return;

  const { data: lastAlert } = await supabase
    .from('fantasy_sync_runs')
    .select('created_at')
    .eq('season_id', season.id)
    .eq('stage', 'alert')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastAlert && Date.now() - new Date(lastAlert.created_at).getTime() < ALERT_DEDUPE_MS) return;

  const recipients = getContactEmailRecipients();
  await sendEmail({
    to: recipients.effectiveContactRecipient,
    subject: `NDCC fantasy sync needs attention (${season.slug})`,
    html: `<p>The automatic PlayHQ fantasy sync for season <strong>${escapeEmailHtml(season.slug)}</strong> has failed ${failures.length} times in a row.</p><p>Latest error: ${escapeEmailHtml(latestError)}</p><p>Open the CMS at /admin/fantasy/seasons to review the sync health panel and retry.</p>`,
  });
  await recordRun(supabase, invokedBy, season.id, {
    seasonSlug: season.slug,
    stage: 'alert',
    status: 'ok',
    detail: { failures: failures.length, latest_error: latestError },
  });
}
