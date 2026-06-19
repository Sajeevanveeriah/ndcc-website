#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const login = readFileSync('app/api/admin/auth/login/route.ts','utf8');
const session = readFileSync('app/api/admin/auth/session/route.ts','utf8');
for (const phrase of ['Admin login service is temporarily unavailable','fetchTimeoutMs: AUTH_SUPABASE_TIMEOUT_MS','Vary']) if (!login.includes(phrase)) { console.error(`Login route missing ${phrase}`); process.exit(1); }
if (!session.includes("Vary: 'Cookie'")) { console.error('Session route missing Vary: Cookie'); process.exit(1); }
console.log('Admin auth static test passed.');
