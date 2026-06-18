import { createClient } from '@supabase/supabase-js';

const SUPABASE_FETCH_TIMEOUT_MS = process.env.NEXT_PHASE === 'phase-production-build' ? 1000 : 3500;

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
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function isServerSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isPublicSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function createServerClient(options: { fetchTimeoutMs?: number | null } = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase server client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
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
    throw new Error('Supabase public server client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
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
