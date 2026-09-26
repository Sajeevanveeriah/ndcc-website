/**
 * True only for "this table or column does not exist yet" errors from
 * Postgres (42P01, 42703) or PostgREST's schema cache (PGRST205, PGRST204).
 * Staged rollouts ship code before its migration, so callers treat these as
 * "feature not available yet"; every other error is a real read failure.
 */
export function isMissingSchemaError(error: { code?: string } | null | undefined): boolean {
  return ['42P01', '42703', 'PGRST205', 'PGRST204'].includes(error?.code || '');
}
