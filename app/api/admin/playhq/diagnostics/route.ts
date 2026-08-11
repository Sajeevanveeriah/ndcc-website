import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { getActivePlayHQBaseUrl, getPlayHQPublicData } from '@/lib/playhq/client';
import { getPlayHQConfig, isFantasySyncEnabled, redactedPlayHQConfig } from '@/lib/playhq/config';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' };

function envCheck(label: string, present: boolean, detail: string, warn = false) {
  return { label, status: present ? 'ok' as const : warn ? 'warn' as const : 'fail' as const, detail };
}

function nextPlayHQCronRun(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(16, 30, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return `${next.toISOString()} (from vercel.json schedule 30 16 * * *)`;
}

async function syncMetadata() {
  if (!supabase) return { lastSuccess: null, lastFailure: null };
  const [success, failure] = await Promise.all([
    supabase.from('fantasy_sync_jobs').select('completed_at, updated_at, created_at').eq('status', 'completed').order('completed_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from('fantasy_sync_jobs').select('error_summary, updated_at, created_at').eq('status', 'failed').order('updated_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ]);
  return {
    lastSuccess: success.data?.completed_at || success.data?.updated_at || success.data?.created_at || null,
    lastFailure: failure.data ? `${failure.data.updated_at || failure.data.created_at}: ${failure.data.error_summary || 'failed with no summary'}` : null,
  };
}

export async function GET() {
  const user = await requirePermission('fantasy.diagnostics');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403, headers: noStore });

  const config = getPlayHQConfig();
  const safeConfig = redactedPlayHQConfig(config);
  const syncEnabled = isFantasySyncEnabled();
  const checks = [
    envCheck('PLAYHQ_API_BASE_URL', Boolean(config.baseUrl), `Configured base URL: ${config.baseUrl}. Current PlayHQ support guidance for Australia and New Zealand is https://api.playhq.com; the legacy https://api.caprod.playhq.com host is honoured with automatic fallback between the two.`),
    envCheck('PLAYHQ_API_KEY', Boolean(config.apiKey), config.apiKey ? 'Present. Value hidden.' : 'Missing. Add the server-only API key in Vercel.'),
    envCheck('PlayHQ tenant header', true, config.tenantSource === 'env' ? 'Present from PLAYHQ_TENANT. Value hidden.' : 'Using the built-in Cricket Australia default (ca). Set PLAYHQ_TENANT only if PlayHQ issues a different tenant short-name.', config.tenantSource !== 'env'),
    envCheck('PLAYHQ_ORGANISATION_ID', Boolean(config.organisationId), config.organisationId ? `Present. Last 4 characters: ${safeConfig.organisationIdLast4}.` : 'Missing. Required to discover seasons.'),
    envCheck('PLAYHQ_DEFAULT_SEASON_ID', Boolean(config.defaultSeasonId), config.defaultSeasonId ? 'Present. Value hidden.' : 'Not set. The app will auto-select a season from PlayHQ.', true),
    envCheck('PLAYHQ_DEFAULT_GRADE_IDS', config.defaultGradeIds.length > 0, `${config.defaultGradeIds.length} grade id(s) configured.`, true),
    envCheck('PLAYHQ_FANTASY_SYNC_ENABLED', syncEnabled, syncEnabled ? 'Fantasy sync is enabled (default unless explicitly set to false).' : 'Fantasy sync is explicitly disabled via PLAYHQ_FANTASY_SYNC_ENABLED=false.', true),
    envCheck('PLAYHQ_FANTASY_SYNC_BATCH_SIZE', Boolean(process.env.PLAYHQ_FANTASY_SYNC_BATCH_SIZE), process.env.PLAYHQ_FANTASY_SYNC_BATCH_SIZE ? `Present. Parsed batch size ${Number(process.env.PLAYHQ_FANTASY_SYNC_BATCH_SIZE) || 'invalid'}.` : 'Unset. Code default applies.', true),
    envCheck('CRON_SECRET', Boolean(process.env.CRON_SECRET), process.env.CRON_SECRET ? 'Present. Value hidden.' : 'Missing. The scheduled cron cannot authenticate; use the admin "Run automatic sync now" action until CRON_SECRET is set in Vercel.', true),
  ];

  let data = null as Awaited<ReturnType<typeof getPlayHQPublicData>> | null;
  if (config.configured) data = await getPlayHQPublicData();
  const sync = await syncMetadata();
  const remediation = [] as string[];
  const activeBaseUrl = getActivePlayHQBaseUrl();
  if (activeBaseUrl && activeBaseUrl !== config.baseUrl) remediation.push(`Requests are succeeding via ${activeBaseUrl} after falling back from the configured ${config.baseUrl}. Update PLAYHQ_API_BASE_URL to the working host.`);
  if (!config.configured) remediation.push(`Add missing required variables: ${config.missing.join(', ')}.`);
  if (data?.error) remediation.push(`Fix the PlayHQ API response error: ${data.error}.`);
  if (!syncEnabled) remediation.push('Fantasy sync is explicitly disabled. Remove PLAYHQ_FANTASY_SYNC_ENABLED=false (or set it to true) once mappings are reviewed.');
  if (!process.env.CRON_SECRET) remediation.push('Generate a CRON_SECRET (32+ random characters) in Vercel so the daily scheduled sync can authenticate. Until then use the admin "Run automatic sync now" action.');
  if (!remediation.length) remediation.push('Configuration and discovery look healthy.');

  return NextResponse.json({
    success: !data?.error,
    config: { ...safeConfig, activeBaseUrl },
    checks,
    connection: { status: data?.error ? 'fail' : config.configured ? 'ok' : 'fail', detail: !config.configured ? 'Not tested because required configuration is missing.' : data?.error || 'PlayHQ request completed without an API error.' },
    discovery: {
      organisation: data ? `${data.seasons.length} season(s) returned for the configured organisation.` : 'Not tested.',
      season: data?.selectedSeasonId ? 'Selected season discovered. Value hidden in UI response details.' : 'No selected season discovered.',
      grades: data ? `${data.grades.length} grade(s), ${data.fixtures.length} fixture(s), ${data.ladders.length} ladder row(s) returned.` : 'Not tested.',
    },
    sync: { ...sync, nextScheduledRun: nextPlayHQCronRun() },
    remediation,
  }, { headers: noStore });
}
