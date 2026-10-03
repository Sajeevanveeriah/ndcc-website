import 'server-only';
import { createTimeoutFetch } from './server/timeout-fetch';
import { withPublicReadCache } from './server/public-read-cache';
import { createClient } from '@supabase/supabase-js';

// 15 s at runtime: a freshly started Vercel instance can take ~12 s before its
// first outbound request completes, and a shorter budget failed those requests
// (including checkout and raffle reads) instead of letting them finish.
const SUPABASE_FETCH_TIMEOUT_MS = process.env.NEXT_PHASE === 'phase-production-build' ? 1000 : 15_000;

export type SupabaseServerReadiness = {
  nextPublicSupabaseUrlPresent: boolean;
  serviceRoleKeyPresent: boolean;
  serviceRoleKeyLooksJwt: boolean;
  anonKeyPresent: boolean;
  canCreateServerClient: boolean;
};

function looksLikeJwt(value: string | undefined) {
  return Boolean(value && value.split('.').length === 3);
}

export function getSupabaseServerReadiness(env: NodeJS.ProcessEnv = process.env): SupabaseServerReadiness {
  const nextPublicSupabaseUrlPresent = Boolean(env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKeyPresent = Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    nextPublicSupabaseUrlPresent,
    serviceRoleKeyPresent,
    serviceRoleKeyLooksJwt: looksLikeJwt(env.SUPABASE_SERVICE_ROLE_KEY),
    anonKeyPresent: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    canCreateServerClient: nextPublicSupabaseUrlPresent && serviceRoleKeyPresent,
  };
}

export function isServerSupabaseConfigured() {
  return getSupabaseServerReadiness().canCreateServerClient;
}

export function isPublicSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// Public CMS reads get at least 10 s per attempt plus one retry. A freshly
// started Vercel instance can take ~12 s before its first outbound request
// completes; shorter budgets turned those first renders into error pages.
const PUBLIC_READ_ATTEMPT_MS = 10_000;
// During `next build` every bounded read gets one attempt of at most 4 s. A
// page whose data cannot load prerenders its fallback and ISR refreshes it
// within 60 s, so an unreachable or stalled database (for example a Supabase
// preview branch deleted while its preview build was queued) cannot hold a
// page past the build's page timeout and fail the deploy.
const IS_BUILD_PRERENDER = process.env.NEXT_PHASE === 'phase-production-build';
const BUILD_READ_ATTEMPT_MS = 4_000;
function createPublicReadTimeoutFetch(timeoutMs: number) {
  if (IS_BUILD_PRERENDER) return createTimeoutFetch(BUILD_READ_ATTEMPT_MS, false);
  return createTimeoutFetch(Math.max(timeoutMs, PUBLIC_READ_ATTEMPT_MS), true);
}

type ServerClientOptions = {
  fetchTimeoutMs?: number | null;
  actorId?: string;
  retryReads?: boolean;
  /**
   * Public CMS reads only: coalesce identical reads, reuse them for a few
   * seconds and serve the last good response when Supabase is slow or down.
   * Never set this for admin, payment, checkout or availability reads.
   */
  publicReadCache?: boolean;
};

export function createServerClient(options: ServerClientOptions = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('Supabase server client configuration is incomplete.');
    error.name = 'SupabaseServerConfigError';
    throw error;
  }

  const requestedTimeoutMs = options.fetchTimeoutMs ?? SUPABASE_FETCH_TIMEOUT_MS;
  const timeoutMs = IS_BUILD_PRERENDER ? Math.min(requestedTimeoutMs, BUILD_READ_ATTEMPT_MS) : requestedTimeoutMs;
  const baseFetch = options.fetchTimeoutMs === null ? undefined : options.publicReadCache
    ? createPublicReadTimeoutFetch(timeoutMs)
    : createTimeoutFetch(timeoutMs, !IS_BUILD_PRERENDER && (options.retryReads ?? true));
  const fetchImpl = options.publicReadCache ? withPublicReadCache(baseFetch ?? fetch, { scope: 'service' }) : baseFetch;
  const clientOptions = fetchImpl ? { fetch: fetchImpl } : {};

  return createClient(supabaseUrl, serviceRoleKey, {
    global: { ...clientOptions, ...(options.actorId ? { headers: { 'x-ndcc-actor': options.actorId } } : {}) },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createPublicServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    const error = new Error('Supabase public server client configuration is incomplete.');
    error.name = 'SupabasePublicConfigError';
    throw error;
  }

  return createClient(supabaseUrl, anonKey, {
    global: {
      fetch: withPublicReadCache(createPublicReadTimeoutFetch(SUPABASE_FETCH_TIMEOUT_MS), { scope: 'anon' }),
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
