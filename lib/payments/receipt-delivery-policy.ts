export function canRecordSimulatedReceiptDelivery(
  env: Partial<Pick<NodeJS.ProcessEnv, 'NODE_ENV' | 'VERCEL_ENV' | 'EMAIL_TEST_MODE'>> = process.env,
): boolean {
  if (env.EMAIL_TEST_MODE !== 'true') return false;
  if (env.VERCEL_ENV === 'production') return false;
  if (!env.VERCEL_ENV && env.NODE_ENV === 'production') return false;
  return true;
}
