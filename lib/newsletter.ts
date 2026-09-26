// Member newsletter helpers: recipient selection (opt-in only), markdown-lite
// rendering to escaped HTML, and signed unsubscribe tokens. Server-side only
// (uses node:crypto); kept free of Next/Supabase imports for direct tests.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { escapeEmailHtml } from './email-html';

/** Emails per batch request. With the send interval below this stays under 2 emails per second. */
export const NEWSLETTER_BATCH_SIZE = 10;
export const NEWSLETTER_SEND_INTERVAL_MS = 550;
export const NEWSLETTER_SUBJECT_MAX = 200;
export const NEWSLETTER_BODY_MAX = 20000;

const EMAIL_PATTERN = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TOKEN_CONTEXT = 'ndcc-newsletter-unsubscribe-v1';

export type NewsletterRecipient = { member_id: string; email: string; name: string };

type MemberEmbed = { id?: string | null; email?: string | null; full_name?: string | null };
export type PreferenceRow = {
  member_id?: string | null;
  email_updates?: boolean | null;
  club_members?: MemberEmbed | MemberEmbed[] | null;
};

/**
 * Only members who explicitly opted in (email_updates === true) with a valid
 * email. One email per address (shared family addresses receive one copy).
 */
export function selectNewsletterRecipients(rows: readonly PreferenceRow[] | null | undefined): NewsletterRecipient[] {
  const byEmail = new Map<string, NewsletterRecipient>();
  for (const row of rows || []) {
    if (row?.email_updates !== true) continue;
    const member = Array.isArray(row.club_members) ? row.club_members[0] : row.club_members;
    const memberId = row.member_id || member?.id || '';
    const email = String(member?.email || '').trim();
    if (!UUID.test(memberId) || email.length > 254 || !EMAIL_PATTERN.test(email)) continue;
    const key = email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, { member_id: memberId, email, name: String(member?.full_name || '').trim() });
  }
  return [...byEmail.values()].sort((a, b) => a.email.toLowerCase().localeCompare(b.email.toLowerCase()));
}

export function validateNewsletterInput(subject: unknown, body: unknown): { ok: true; subject: string; body: string } | { ok: false; error: string } {
  if (typeof subject !== 'string' || !subject.trim()) return { ok: false, error: 'Enter a subject.' };
  if (subject.trim().length > NEWSLETTER_SUBJECT_MAX || /[\r\n]/.test(subject)) return { ok: false, error: `Keep the subject to one line of ${NEWSLETTER_SUBJECT_MAX} characters or fewer.` };
  if (typeof body !== 'string' || !body.trim()) return { ok: false, error: 'Enter the newsletter text.' };
  if (body.length > NEWSLETTER_BODY_MAX) return { ok: false, error: `Keep the newsletter to ${NEWSLETTER_BODY_MAX} characters or fewer.` };
  return { ok: true, subject: subject.trim(), body: body.replace(/\r\n?/g, '\n').trim() };
}

const LINK_STYLE = 'color:#880000;text-decoration:underline;';

/** Inline formatting on already-escaped text: **bold** and [label](https://link). */
function inline(escaped: string): string {
  return escaped
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]\n]{1,200})\]\((https:\/\/[^\s)]{1,500})\)/g, `<a href="$2" style="${LINK_STYLE}">$1</a>`);
}

/**
 * Markdown-lite to safe email HTML. Everything is escaped first, so authors
 * cannot inject markup; only headings (#), bullet lists (- or *), bold,
 * https links, paragraphs and line breaks are produced.
 */
export function renderNewsletterBody(text: string): string {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n').map((line) => line.trim());
    const heading = lines.length === 1 ? /^#{1,3}\s+(.+)$/.exec(lines[0]) : null;
    if (heading) return `<h2 style="margin:24px 0 8px;font-size:20px;line-height:1.3;color:#4a0000;">${inline(escapeEmailHtml(heading[1]))}</h2>`;
    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      const items = lines.map((line) => `<li style="margin:0 0 6px;">${inline(escapeEmailHtml(line.replace(/^[-*]\s+/, '')))}</li>`).join('');
      return `<ul style="margin:0 0 16px;padding-left:22px;">${items}</ul>`;
    }
    return `<p style="margin:0 0 16px;">${lines.map((line) => inline(escapeEmailHtml(line))).join('<br>')}</p>`;
  }).join('\n');
}

export function newsletterFooterHtml(unsubscribeUrl: string | null): string {
  const reason = '<p style="margin:24px 0 0;font-size:13px;color:#4b5563;">You are receiving this because you chose to receive club email updates in your NDCC club account.';
  if (!unsubscribeUrl) return `${reason}</p>`;
  return `${reason} <a href="${escapeEmailHtml(unsubscribeUrl)}" style="${LINK_STYLE}">Unsubscribe from club email updates</a>.</p>`;
}

/** Domain-separated signing key; null when no server secret is configured. */
export function unsubscribeSigningKey(env: Record<string, string | undefined>): string | null {
  const base = env.NEWSLETTER_UNSUBSCRIBE_SECRET?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return base ? createHmac('sha256', base).update(TOKEN_CONTEXT).digest('base64url') : null;
}

function signature(memberId: string, key: string) {
  return createHmac('sha256', key).update(`${TOKEN_CONTEXT}:${memberId.toLowerCase()}`).digest('base64url');
}

/** A per-member token that does not expire, so old emails can still unsubscribe. */
export function signUnsubscribeToken(memberId: string, key: string): string {
  if (!UUID.test(memberId)) throw new Error('Invalid member id.');
  return `${memberId.toLowerCase()}.${signature(memberId, key)}`;
}

export function verifyUnsubscribeToken(token: unknown, key: string): string | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const [memberId, sig, extra] = token.split('.');
  if (extra !== undefined || !memberId || !sig || !UUID.test(memberId)) return null;
  const expected = Buffer.from(signature(memberId, key), 'base64url');
  const received = Buffer.from(sig, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return memberId.toLowerCase();
}
