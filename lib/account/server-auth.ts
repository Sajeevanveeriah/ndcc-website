// Neutral server-side bearer-token helpers for the shared Supabase Auth pool.
// Club account routes import from here so their code paths carry no Dino
// Coach wording. The implementation stays in lib/fantasy-manager-auth.ts so
// every existing Dino Coach import keeps working unchanged.
export { createAnonAuthClient, getAuthUserFromRequest, getBearerToken } from '@/lib/fantasy-manager-auth';
