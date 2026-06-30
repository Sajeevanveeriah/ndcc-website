#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const login = readFileSync('app/api/admin/auth/login/route.ts','utf8');
const session = readFileSync('app/api/admin/auth/session/route.ts','utf8');
const logout = readFileSync('app/api/admin/auth/logout/route.ts','utf8');
const helper = readFileSync('lib/supabase-operation.ts','utf8');
const adminClient = readFileSync('lib/admin-client.ts','utf8');
const loginPage = readFileSync('app/admin/login/page.tsx','utf8');
const cryptRepair = readFileSync('supabase/migrations/20260630_repair_committee_auth_crypt_resolution.sql','utf8');
const readiness = readFileSync('app/api/admin/auth/readiness/route.ts','utf8');
const supabaseServer = readFileSync('lib/supabase-server.ts','utf8');
if (!login.includes('requestId') || !login.includes('CREDENTIAL_RPC_TIMEOUT_MS') || !login.includes('SESSION_INSERT_TIMEOUT_MS')) { console.error('Login route missing bounded timeout/requestId behaviour.'); process.exit(1); }
if (!loginPage.includes('finally') || !loginPage.includes('setLoading(false)') || !loginPage.includes("router.replace('/admin')") || !loginPage.includes('router.refresh()')) { console.error('Login page must stop spinner and refresh on success.'); process.exit(1); }
if (!cryptRepair.includes('extensions.crypt(p_password, u.password_hash)') || !cryptRepair.includes('GRANT EXECUTE ON FUNCTION public.ndcc_verify_committee_user(TEXT, TEXT) TO service_role')) { console.error('Auth crypt repair migration must use extensions.crypt and service_role grant.'); process.exit(1); }
for (const phrase of ['stage', 'diagnosticCode', 'SUPABASE_SERVER_CONFIG_MISSING', 'CREDENTIAL_RPC_FAILED', 'SESSION_INSERT_FAILED', 'UNEXPECTED_LOGIN_ERROR']) if (!login.includes(phrase)) { console.error(`Login route missing safe diagnostic ${phrase}`); process.exit(1); }
if (!login.includes("return jsonNoStore({ success: false, error: 'Invalid email or password.', requestId: id }, 401)")) { console.error('Invalid credentials must remain a 401 response.'); process.exit(1); }
for (const phrase of ['stageLabel', 'Supabase configuration', 'Credential verification', 'Session creation', 'Reference:']) if (!loginPage.includes(phrase)) { console.error(`Login page missing safe stage display ${phrase}`); process.exit(1); }
for (const phrase of ['ADMIN_AUTH_READINESS_ENABLED', 'ADMIN_DIAGNOSTIC_TOKEN', 'return hidden()', 'x-diagnostic-token', 'canCallCredentialRpcWithInvalidCredentials', 'invalidCredentialRpcReturnedNoUser', 'DIAGNOSTIC_MUTATION_ENABLED']) if (!readiness.includes(phrase)) { console.error(`Readiness route missing ${phrase}`); process.exit(1); }
if (!supabaseServer.includes('getSupabaseServerReadiness') || !supabaseServer.includes('serviceRoleKeyLooksJwt') || supabaseServer.includes('console.log(process.env.SUPABASE_SERVICE_ROLE_KEY)')) { console.error('Supabase server readiness helper missing or unsafe.'); process.exit(1); }
for (const phrase of ['Admin login service is temporarily unavailable','withSupabaseOperationRetry','Supabase configuration readiness','credential RPC','session insert','cookie creation','Vary']) if (!login.includes(phrase)) { console.error(`Login route missing ${phrase}`); process.exit(1); }
for (const phrase of ['isRetryableSupabaseError','500, 502, 503, 504','RETRY_DELAY_MIN_MS = 200','RETRY_DELAY_JITTER_MS = 200']) if (!helper.includes(phrase)) { console.error(`Supabase retry helper missing ${phrase}`); process.exit(1); }
if (!session.includes("Vary: 'Cookie'")) { console.error('Session route missing Vary: Cookie'); process.exit(1); }
if (!logout.includes('status: 503') || !logout.includes('clearAuthCookie()')) { console.error('Logout route must return 503 before clearing cookies on backend failure.'); process.exit(1); }
if (!adminClient.includes("credentials: 'include'") || !adminClient.includes("cache: 'no-store'")) { console.error('Admin client fetch must include credentials and no-store by default.'); process.exit(1); }
console.log('Admin auth static test passed.');
