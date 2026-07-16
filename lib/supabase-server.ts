import { createClient } from '@supabase/supabase-js';

const SUPABASE_FETCH_TIMEOUT_MS = process.env.NEXT_PHASE === 'phase-production-build' ? 1000 : 7500;

function createTimeoutFetch(timeoutMs = SUPABASE_FETCH_TIMEOUT_MS): typeof fetch {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const upstreamSignal = init.signal;

    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        controller.abort();
      } else {
        upstreamSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    try {
      // cache: 'no-store' is load-bearing: Next.js patches global fetch with
      // its Data Cache, and repeated identical Supabase GETs within one
      // invocation can otherwise return the FIRST response (observed in
      // production on 2026-07-16: fantasy round existence checks and job
      // state reads returned stale rows, failing 10 game imports on
      // duplicate keys). Database API reads must never be cached.
      return await fetch(input, { ...init, cache: 'no-store', signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };
}

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

export function createServerClient(options: { fetchTimeoutMs?: number | null } = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('Supabase server client configuration is incomplete.');
    error.name = 'SupabaseServerConfigError';
    throw error;
  }

  const clientOptions = options.fetchTimeoutMs === null ? {} : { fetch: createTimeoutFetch(options.fetchTimeoutMs) };

  return createClient(supabaseUrl, serviceRoleKey, {
    global: clientOptions,
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
      fetch: createTimeoutFetch(),
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
