/**
 * True while `next build` is prerendering ISR pages. Pages that deliberately
 * throw when the database is unreachable (so an outage is never mistaken for
 * "nothing published") use this to render their load-error state instead of
 * failing the whole build when CI builds without Supabase credentials, or the
 * database is briefly unreachable during a deploy. At runtime the error is
 * still thrown, so ISR keeps serving the last good page.
 */
export function isBuildPrerender(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}
