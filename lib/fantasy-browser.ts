'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isFantasySupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const fantasyBrowserClient = isFantasySupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

export function getFantasyBrowserClient() {
  if (!fantasyBrowserClient) throw new Error('Fantasy sign-in is not configured yet.');
  return fantasyBrowserClient;
}

export async function fantasyAuthHeaders() {
  if (!fantasyBrowserClient) return {};
  const { data } = await fantasyBrowserClient.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fantasyJsonFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const authHeaders = await fantasyAuthHeaders();
  for (const [key, value] of Object.entries(authHeaders)) headers.set(key, value);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  // Without a deadline a hung Supabase request never rejects, leaving loading
  // states spinning forever. Abort and surface a readable error instead.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, signal: options.signal ?? controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The fantasy service is taking too long to respond. Please try again shortly.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `Request failed (${response.status})`);
  return body as T;
}
