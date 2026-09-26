'use client';
import { accountJsonFetch } from '@/lib/account/browser';
const errors = {
  unreadable: 'The club account service returned an unreadable response. Please reload to check your saved changes.',
  timeout: 'The club account service is taking too long to respond. Please try again shortly.',
};
export function clubAccountJsonFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  return accountJsonFetch<T>(url, options, errors);
}
