import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailHtml } from '@/lib/email';
import { absoluteUrl } from '@/lib/seo';
import {
  newsletterFooterHtml, renderNewsletterBody, selectNewsletterRecipients, signUnsubscribeToken, unsubscribeSigningKey,
  type NewsletterRecipient, type PreferenceRow,
} from '@/lib/newsletter';

export function newsletterSigningKey() {
  return unsubscribeSigningKey(process.env);
}

/** Opted-in members only (club_account_preferences.email_updates = true). */
export async function loadNewsletterRecipients(client: SupabaseClient): Promise<{ ok: true; recipients: NewsletterRecipient[] } | { ok: false }> {
  const rows: PreferenceRow[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await client.from('club_account_preferences')
      .select('member_id,email_updates,club_members!inner(id,email,full_name)')
      .eq('email_updates', true)
      .order('member_id', { ascending: true })
      .range(from, from + 999);
    if (error) return { ok: false };
    rows.push(...((data || []) as PreferenceRow[]));
    if (!data || data.length < 1000) break;
  }
  return { ok: true, recipients: selectNewsletterRecipients(rows) };
}

export function unsubscribeUrlFor(memberId: string | null, key: string | null): string | null {
  if (!memberId || !key) return null;
  return absoluteUrl(`/api/club-account/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(memberId, key))}`);
}

export function newsletterEmailHtml(subject: string, body: string, unsubscribeUrl: string | null): string {
  return emailHtml(subject, `${renderNewsletterBody(body)}${newsletterFooterHtml(unsubscribeUrl)}`);
}
