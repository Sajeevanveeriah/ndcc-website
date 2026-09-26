// Pure check used by GET /api/fantasy/manager (tested in
// scripts/test-manager-response-privacy.cjs). The account page polls that
// endpoint every few seconds, so it only nudges the welcome email when the
// fantasy_registration_emails job is actually due: unsent, past its backoff
// (next_attempt_at) and not leased by another attempt. Delivery is still
// guaranteed by the registration POST, the admin registration flow and the
// daily /api/cron/payment-receipts retry scan (retryRegistrationEmails).
export type RegistrationEmailJobState = {
  sent_at: string | null;
  next_attempt_at: string | null;
  lease_until: string | null;
} | null | undefined;

export function registrationEmailRetryDue(job: RegistrationEmailJobState, nowMs: number = Date.now()): boolean {
  if (!job || job.sent_at) return false;
  const nextAttempt = job.next_attempt_at ? Date.parse(job.next_attempt_at) : Number.NaN;
  if (Number.isFinite(nextAttempt) && nextAttempt > nowMs) return false;
  const lease = job.lease_until ? Date.parse(job.lease_until) : Number.NaN;
  if (Number.isFinite(lease) && lease > nowMs) return false;
  return true;
}
