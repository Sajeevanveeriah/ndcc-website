'use client';
// Neutral entry point for the shared Supabase Auth session used by club
// accounts and Dino Coach. Both products share one auth pool and one browser
// session, so this module reuses the single client created in
// lib/fantasy-browser.ts (a second client would race over the same stored
// session) and only replaces the product-specific wording.
import { fantasyAuthHeaders, fantasyBrowserClient, fantasyJsonFetch, isFantasySupabaseConfigured } from '@/lib/fantasy-browser';

export const ACCOUNT_NOT_CONFIGURED_MESSAGE = 'Account sign-in is not configured yet.';
export const accountRequestErrors = {
  unreadable: 'The account service returned an unreadable response. Please reload to check your saved changes.',
  timeout: 'The account service is taking too long to respond. Please try again shortly.',
};

export const isAccountAuthConfigured = isFantasySupabaseConfigured;

export function getAccountBrowserClient() {
  if (!fantasyBrowserClient) throw new Error(ACCOUNT_NOT_CONFIGURED_MESSAGE);
  return fantasyBrowserClient;
}

export function accountAuthHeaders(): Promise<Record<string, string>> {
  return fantasyAuthHeaders();
}

export function accountJsonFetch<T>(url: string, options: RequestInit = {}, errors: { unreadable: string; timeout: string } = accountRequestErrors): Promise<T> {
  return fantasyJsonFetch<T>(url, options, errors);
}
