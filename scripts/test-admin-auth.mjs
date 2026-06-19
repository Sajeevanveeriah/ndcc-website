#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const login = readFileSync('app/api/admin/auth/login/route.ts','utf8');
const session = readFileSync('app/api/admin/auth/session/route.ts','utf8');
const logout = readFileSync('app/api/admin/auth/logout/route.ts','utf8');
const helper = readFileSync('lib/supabase-operation.ts','utf8');
const adminClient = readFileSync('lib/admin-client.ts','utf8');
for (const phrase of ['Admin login service is temporarily unavailable','withSupabaseOperationRetry','Supabase configuration readiness','credential RPC','session insert','cookie creation','Vary']) if (!login.includes(phrase)) { console.error(`Login route missing ${phrase}`); process.exit(1); }
for (const phrase of ['isRetryableSupabaseError','500, 502, 503, 504','RETRY_DELAY_MIN_MS = 200','RETRY_DELAY_JITTER_MS = 200']) if (!helper.includes(phrase)) { console.error(`Supabase retry helper missing ${phrase}`); process.exit(1); }
if (!session.includes("Vary: 'Cookie'")) { console.error('Session route missing Vary: Cookie'); process.exit(1); }
if (!logout.includes('status: 503') || !logout.includes('clearAuthCookie()')) { console.error('Logout route must return 503 before clearing cookies on backend failure.'); process.exit(1); }
if (!adminClient.includes("credentials: 'include'") || !adminClient.includes("cache: 'no-store'")) { console.error('Admin client fetch must include credentials and no-store by default.'); process.exit(1); }
console.log('Admin auth static test passed.');
