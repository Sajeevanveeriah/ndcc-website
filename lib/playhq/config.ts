import 'server-only';

export type PlayHQConfig = {
  configured: boolean;
  baseUrl: string;
  apiKey: string | null;
  organisationId: string | null;
  defaultSeasonId: string | null;
  defaultGradeIds: string[];
  revalidateSeconds: number;
  missing: string[];
};

const DEFAULT_BASE_URL = 'https://api.caprod.playhq.com';
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
  const revalidateSeconds = Math.max(60, Number(env.PLAYHQ_CACHE_REVALIDATE_SECONDS || DEFAULT_REVALIDATE_SECONDS) || DEFAULT_REVALIDATE_SECONDS);
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
    defaultSeasonId: env.PLAYHQ_DEFAULT_SEASON_ID?.trim() || null,
    defaultGradeIds: splitCsv(env.PLAYHQ_DEFAULT_GRADE_IDS),
    revalidateSeconds,
    missing,
  };
}

export function redactedPlayHQConfig(config = getPlayHQConfig()) {
  return {
    configured: config.configured,
    baseUrl: config.baseUrl,
    apiKeyConfigured: Boolean(config.apiKey),
    organisationIdConfigured: Boolean(config.organisationId),
    organisationIdLast4: config.organisationId ? config.organisationId.slice(-4) : null,
    defaultSeasonIdConfigured: Boolean(config.defaultSeasonId),
    defaultGradeIdsCount: config.defaultGradeIds.length,
    revalidateSeconds: config.revalidateSeconds,
    missing: config.missing,
  };
}
