import 'server-only';

export type PlayHQConfig = {
  configured: boolean;
  baseUrl: string;
  apiKey: string | null;
  organisationId: string | null;
  tenant: string;
  tenantSource: 'env' | 'default';
  defaultSeasonId: string | null;
  defaultGradeIds: string[];
  revalidateSeconds: number;
  missing: string[];
};

const DEFAULT_BASE_URL = 'https://api.playhq.com';
// Cricket Australia's tenant short-name per PlayHQ Public API guidance. The
// production deployment predates the tenant header requirement, so the value
// defaults here instead of being a hard env requirement — an operator can
// still override it with PLAYHQ_TENANT if PlayHQ ever issues a different one.
const DEFAULT_TENANT = 'ca';
// Legacy Cricket Australia host from the original setup guide; requests to it
// are honoured, and the client can fall back between the two known hosts.
export const LEGACY_BASE_URL = 'https://api.caprod.playhq.com';
const DEFAULT_REVALIDATE_SECONDS = 3600;

function cleanBaseUrl(value: string | undefined) {
  return (value || DEFAULT_BASE_URL).trim().replace(/\]+$/g, '').replace(/\/$/, '');
}

function splitCsv(value: string | undefined) {
  return (value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

export function getPlayHQConfig(env: NodeJS.ProcessEnv = process.env): PlayHQConfig {
  const apiKey = env.PLAYHQ_API_KEY?.trim() || null;
  const organisationId = (env.PLAYHQ_ORGANISATION_ID || env.PLAYHQ_ORG_ID || '').trim() || null;
  const baseUrl = cleanBaseUrl(env.PLAYHQ_API_BASE_URL);
  const tenantFromEnv = (env.PLAYHQ_TENANT || env.PLAYHQ_TENANT_SHORT_NAME || env.PLAYHQ_TENANT_ID || '').trim() || null;
  const revalidateSeconds = Math.max(60, Number(env.PLAYHQ_CACHE_REVALIDATE_SECONDS || DEFAULT_REVALIDATE_SECONDS) || DEFAULT_REVALIDATE_SECONDS);
  // Only genuinely secret/unique values are required. PLAYHQ_TENANT is a
  // documented public constant for Cricket Australia and must never gate the
  // whole integration off (that regression made production report
  // "not configured" while holding a valid key).
  const required: Array<[string, string | null]> = [
    ['PLAYHQ_API_KEY', apiKey],
    ['PLAYHQ_ORGANISATION_ID', organisationId],
  ];
  const missing = required.flatMap(([key, value]) => (value ? [] : [key]));

  return {
    configured: missing.length === 0,
    baseUrl,
    apiKey,
    organisationId,
    tenant: tenantFromEnv ?? DEFAULT_TENANT,
    tenantSource: tenantFromEnv ? 'env' : 'default',
    defaultSeasonId: env.PLAYHQ_DEFAULT_SEASON_ID?.trim() || null,
    defaultGradeIds: splitCsv(env.PLAYHQ_DEFAULT_GRADE_IDS),
    revalidateSeconds,
    missing,
  };
}

/** Fantasy sync is on unless the operator explicitly sets
 *  PLAYHQ_FANTASY_SYNC_ENABLED=false. The orchestrator has its own safety
 *  gates (per-season auto_sync_enabled, database lease, publish validation),
 *  so an unset flag must not silently strand the pipeline. */
export function isFantasySyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.PLAYHQ_FANTASY_SYNC_ENABLED || '').trim().toLowerCase() !== 'false';
}

export function redactedPlayHQConfig(config = getPlayHQConfig()) {
  return {
    configured: config.configured,
    baseUrl: config.baseUrl,
    apiKeyConfigured: Boolean(config.apiKey),
    organisationIdConfigured: Boolean(config.organisationId),
    tenantConfigured: true,
    tenantSource: config.tenantSource,
    organisationIdLast4: config.organisationId ? config.organisationId.slice(-4) : null,
    defaultSeasonIdConfigured: Boolean(config.defaultSeasonId),
    defaultGradeIdsCount: config.defaultGradeIds.length,
    revalidateSeconds: config.revalidateSeconds,
    missing: config.missing,
  };
}
