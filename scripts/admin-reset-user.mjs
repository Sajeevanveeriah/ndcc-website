#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const [emailArg, fullNameArg, roleArg = 'admin'] = process.argv.slice(2);
if (!emailArg || !fullNameArg) {
  console.error('Usage: node scripts/admin-reset-user.mjs email "Full Name" role');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const roles = new Set(['admin', 'president', 'secretary', 'committee']);
const role = String(roleArg).trim().toLowerCase();
if (!roles.has(role)) {
  console.error(`Invalid role "${role}".`);
  process.exit(1);
}
const email = String(emailArg).trim().toLowerCase();
const fullName = String(fullNameArg).trim();
let password = process.env.NDCC_ADMIN_RESET_PASSWORD;
if (!password) {
  const rl = createInterface({ input, output });
  password = await rl.question('New password (input hidden by terminal where supported): ');
  rl.close();
}
if (!password || password.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await supabase.rpc('ndcc_admin_reset_committee_user', {
  p_email: email,
  p_full_name: fullName,
  p_role: role,
  p_password: password,
}).single();
if (error) throw error;
console.log(JSON.stringify({
  user_id: data.id,
  email: data.email,
  role: data.role,
  is_active: data.is_active,
  sessions_revoked: data.sessions_revoked ?? 0,
}, null, 2));
