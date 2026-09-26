// Shared password rule for self-service club accounts.
// Supabase client sign-ups and password updates go straight to Supabase Auth,
// so the server-side minimum must also be set in the Supabase dashboard
// (Authentication > Providers > Email > Minimum password length = 8).
// No club-account API route accepts or sets a password. Committee and admin
// routes that set passwords already enforce their own, longer minimums.
export const ACCOUNT_PASSWORD_MIN_LENGTH = 8;

export function accountPasswordError(password: string): string | null {
  if (password.length < ACCOUNT_PASSWORD_MIN_LENGTH) return `Use at least ${ACCOUNT_PASSWORD_MIN_LENGTH} characters for your password.`;
  return null;
}
