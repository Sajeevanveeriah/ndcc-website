import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { FANTASY_ADMIN_ROLES } from '@/lib/auth/config';
import { getPlayHQPublicData } from '@/lib/playhq/client';
import { getPlayHQConfig, redactedPlayHQConfig } from '@/lib/playhq/config';
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
  const user = await requireSession(FANTASY_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403, headers: noStore });

  const config = getPlayHQConfig();
  const safeConfig = redactedPlayHQConfig(config);
  const tenantConfigured = Boolean(config.tenant);
  const checks = [
    envCheck('PLAYHQ_API_BASE_URL', Boolean(config.baseUrl), `Configured base URL: ${config.baseUrl}. Current PlayHQ support guidance for Australia and New Zealand is https://api.playhq.com.`),
    envCheck('PLAYHQ_API_KEY', Boolean(config.apiKey), config.apiKey ? 'Present. Value hidden.' : 'Missing. Add the server-only API key in Vercel.'),
    envCheck('PlayHQ tenant header', tenantConfigured, tenantConfigured ? 'Present. Value hidden; Cricket Australia should use the ca tenant short-name.' : 'Missing. Set PLAYHQ_TENANT or PLAYHQ_TENANT_SHORT_NAME to the sport tenant short-name, for example ca.'),
    envCheck('PLAYHQ_ORGANISATION_ID', Boolean(config.organisationId), config.organisationId ? `Present. Last 4 characters: ${safeConfig.organisationIdLast4}.` : 'Missing. Required to discover seasons.'),
    envCheck('PLAYHQ_DEFAULT_SEASON_ID', Boolean(config.defaultSeasonId), config.defaultSeasonId ? 'Present. Value hidden.' : 'Not set. The app will auto-select a season from PlayHQ.', true),
    envCheck('PLAYHQ_DEFAULT_GRADE_IDS', config.defaultGradeIds.length > 0, `${config.defaultGradeIds.length} grade id(s) configured.`, true),
    envCheck('PLAYHQ_FANTASY_SYNC_ENABLED', process.env.PLAYHQ_FANTASY_SYNC_ENABLED === 'true', process.env.PLAYHQ_FANTASY_SYNC_ENABLED === 'true' ? 'Cron sync is enabled.' : 'Cron sync is disabled or unset.', true),
    envCheck('PLAYHQ_FANTASY_SYNC_BATCH_SIZE', Boolean(process.env.PLAYHQ_FANTASY_SYNC_BATCH_SIZE), process.env.PLAYHQ_FANTASY_SYNC_BATCH_SIZE ? `Present. Parsed batch size ${Number(process.env.PLAYHQ_FANTASY_SYNC_BATCH_SIZE) || 'invalid'}.` : 'Unset. Code default applies.', true),
    envCheck('CRON_SECRET', Boolean(process.env.CRON_SECRET), process.env.CRON_SECRET ? 'Present. Value hidden.' : 'Missing. Scheduled sync endpoint rejects unauthorised calls.'),
  ];

  let data = null as Awaited<ReturnType<typeof getPlayHQPublicData>> | null;
  if (config.configured) data = await getPlayHQPublicData();
  const sync = await syncMetadata();
  const remediation = [] as string[];
  if (config.baseUrl !== 'https://api.playhq.com') remediation.push('Update PLAYHQ_API_BASE_URL to https://api.playhq.com for Australia and New Zealand unless PlayHQ has explicitly issued a different environment for this credential.');
  if (!tenantConfigured) remediation.push('Add the PlayHQ tenant short-name header configuration. For Cricket Australia this is expected to be ca according to PlayHQ support examples.');
  if (!config.configured) remediation.push(`Add missing required variables: ${config.missing.join(', ')}.`);
  if (data?.error) remediation.push(`Fix the PlayHQ API response error before enabling Fantasy sync: ${data.error}.`);
  if (process.env.PLAYHQ_FANTASY_SYNC_ENABLED !== 'true') remediation.push('Keep scheduled Fantasy sync disabled until season and grade mappings are reviewed, then set PLAYHQ_FANTASY_SYNC_ENABLED=true.');
  if (!remediation.length) remediation.push('Configuration and discovery look ready for a dry-run sync in a preview or safe environment.');

  return NextResponse.json({
    success: !data?.error,
    config: safeConfig,
    checks,
    connection: { status: data?.error ? 'fail' : config.configured ? 'ok' : 'fail', detail: !config.configured ? 'Not tested because required configuration is missing.' : data?.error || 'PlayHQ request completed without an API error.' },
    discovery: {
      organisation: data ? `${data.seasons.length} season(s) returned for the configured organisation.` : 'Not tested.',
      season: data?.selectedSeasonId ? `Selected season discovered. Value hidden in UI response details.` : 'No selected season discovered.',
      grades: data ? `${data.grades.length} grade(s), ${data.fixtures.length} fixture(s), ${data.ladders.length} ladder row(s) returned.` : 'Not tested.',
    },
    sync: { ...sync, nextScheduledRun: nextPlayHQCronRun() },
    remediation,
  }, { headers: noStore });
}
