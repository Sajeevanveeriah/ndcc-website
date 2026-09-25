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

export async function fantasyAuthHeaders(): Promise<Record<string, string>> {
  if (!fantasyBrowserClient) return {};
  const { data } = await fantasyBrowserClient.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fantasyJsonFetch<T>(url: string, options: RequestInit = {}, errors?: { unreadable: string; timeout: string }): Promise<T> {
  const headers = new Headers(options.headers);
  const authHeaders = await fantasyAuthHeaders();
  for (const [key, value] of Object.entries(authHeaders)) headers.set(key, value);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  // Without a deadline a hung Supabase request never rejects, leaving loading
  // states spinning forever. Abort and surface a readable error instead.
  const controller = new AbortController();
  // Mutations include sequential eligibility checks, Stripe calls and email
  // delivery. Do not report a timeout while those writes are still completing.
  const isRead = !options.method || ['GET', 'HEAD'].includes(options.method.toUpperCase());
  const timeout = setTimeout(() => controller.abort(), isRead ? 30_000 : 45_000);
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const request = () => fetch(url, { cache: 'no-store', ...options, headers, signal: controller.signal });
    let response: Response;
    let retried = false;
    try {
      response = await request();
    } catch (error) {
      if (!isRead || controller.signal.aborted) throw error;
      retried = true;
      response = await request();
    }
    if (isRead && !retried && [502, 503, 504].includes(response.status)) {
      await response.body?.cancel();
      response = await request();
    }
    const body: unknown = await response.json().catch(error => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    const object = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
    if (!response.ok || object?.success === false) {
      throw new Error(typeof object?.error === 'string' ? object.error : `Request failed (${response.status})`);
    }
    if (!object) throw new Error(errors?.unreadable || 'Dino Coach returned an unreadable response. Please reload to check your latest saved changes.');
    return object as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(errors?.timeout || 'The fantasy service is taking too long to respond. Please try again shortly.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
