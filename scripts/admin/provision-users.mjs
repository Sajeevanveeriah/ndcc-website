#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const REQUIRED_ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const USERS = [
  { key: 'saj', email: 'sajeevanveeriah@gmail.com', fullName: 'Sajeevan Veeriah', role: 'admin', passwordEnv: 'NDCC_SAJ_TEMP_PASSWORD' },
  { key: 'president', email: 'ndsc.cricket@gmail.com', fullName: 'John Elliott', role: 'president', passwordEnv: 'NDCC_PRESIDENT_TEMP_PASSWORD' },
  { key: 'vp', email: 'ndcc.vicepres@gmail.com', fullName: 'Troy Whitworth', role: 'committee', title: 'Vice President', passwordEnv: 'NDCC_VP_TEMP_PASSWORD' },
];

const rawArgs = process.argv.slice(2);
const execute = rawArgs.includes('--execute');
const diagnosticsOnly = rawArgs.includes('--diagnostics');
const all = rawArgs.includes('--all');
const verifyProductionLogin = rawArgs.includes('--verify-production-login');
const onlyArg = rawArgs.find((arg) => arg.startsWith('--only='));
const known = new Set(['--execute', '--diagnostics', '--all', '--verify-production-login']);
const unknownArgs = rawArgs.filter((arg) => !known.has(arg) && !arg.startsWith('--only='));

if (unknownArgs.length || (all && onlyArg)) {
  console.error(`Invalid argument(s): ${unknownArgs.join(', ') || '--all cannot be combined with --only'}`);
  console.error('Usage: npm run admin:provision-users -- [--diagnostics] [--only=saj|president|vp|--all] [--execute] [--verify-production-login]');
  process.exit(1);
}

const selectedUsers = onlyArg
  ? USERS.filter((user) => user.key === onlyArg.slice('--only='.length))
  : all
    ? USERS
    : USERS;

if (!selectedUsers.length) {
  console.error(`No configured user matches ${onlyArg}. Valid keys: ${USERS.map((user) => user.key).join(', ')}`);
  process.exit(1);
}

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

if (execute) {
  const missingPasswords = selectedUsers.map((user) => user.passwordEnv).filter((key) => !process.env[key]);
  if (missingPasswords.length) {
    console.error(`Missing required temporary password environment variables for selected --execute users: ${missingPasswords.join(', ')}`);
    process.exit(1);
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function fail(message, error) {
  console.error(message);
  if (error) console.error(error.message || error);
  process.exit(1);
}

async function verifyTable(tableName) {
  const { error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
  if (error) fail(`Diagnostics failed: ${tableName} table is not available.`, error);
  console.log(`OK: ${tableName} table is available.`);
}

async function verifyLoginRpcExists() {
  const { error } = await supabase.rpc('ndcc_verify_committee_user', { p_email: 'diagnostic@example.invalid', p_password: `diagnostic-${randomUUID()}` });
  if (error) fail('Diagnostics failed: ndcc_verify_committee_user RPC is not available.', error);
  console.log('OK: ndcc_verify_committee_user RPC is available.');
}

async function verifySetPasswordRpcExists() {
  const { error } = await supabase.rpc('ndcc_set_committee_password', { p_user_id: randomUUID(), p_password: `diagnostic-${randomUUID()}` });
  if (error && !String(error.message || '').toLowerCase().includes('not found')) fail('Diagnostics failed: ndcc_set_committee_password RPC is not available.', error);
  console.log('OK: ndcc_set_committee_password RPC is available.');
}

async function printSafeUserStatus() {
  const emails = USERS.map((user) => user.email);
  const { data, error } = await supabase.from('committee_users').select('email, full_name, role, is_active').in('email', emails).order('email', { ascending: true });
  if (error) fail('Unable to read safe committee user status.', error);
  const byEmail = new Map((data || []).map((user) => [String(user.email).toLowerCase(), user]));
  console.log('Safe user status:');
  for (const user of USERS) {
    const existing = byEmail.get(user.email);
    console.log(existing ? `- ${existing.email}: full_name=${existing.full_name}; role=${existing.role}; is_active=${existing.is_active}` : `- ${user.email}: missing`);
  }
}

async function runDiagnostics() {
  console.log('Running safe admin auth diagnostics...');
  await verifyTable('committee_users');
  await verifyTable('committee_sessions');
  await verifyLoginRpcExists();
  await verifySetPasswordRpcExists();
  await printSafeUserStatus();
}

async function findUser(email) {
  const { data, error } = await supabase.from('committee_users').select('id, email, full_name, role, is_active').eq('email', email.toLowerCase()).maybeSingle();
  if (error) fail(`Unable to look up ${email}.`, error);
  return data;
}

async function setPassword(userId, password) {
  const { error } = await supabase.rpc('ndcc_set_committee_password', { p_user_id: userId, p_password: password });
  if (error) fail('Password reset failed before session cleanup.', error);
}

async function clearUserSessions(userId) {
  const { error } = await supabase.from('committee_sessions').delete().eq('user_id', userId);
  if (error) fail('Password was reset, but old session cleanup failed.', error);
}

async function updateUser(userId, user) {
  const { error } = await supabase.from('committee_users').update({ email: user.email, full_name: user.fullName, role: user.role, is_active: true, updated_at: new Date().toISOString() }).eq('id', userId);
  if (error) fail(`Unable to update ${user.email}.`, error);
}

async function createUser(user) {
  const { data, error } = await supabase.from('committee_users').insert({ email: user.email, full_name: user.fullName, role: user.role, is_active: true, password_hash: `provisioning-pending-${randomUUID()}` }).select('id').single();
  if (error) fail(`Unable to create ${user.email}.`, error);
  return data.id;
}

async function verifyLogin() {
  const baseUrl = process.env.AUTH_TEST_BASE_URL;
  const email = process.env.AUTH_TEST_EMAIL;
  const password = process.env.AUTH_TEST_PASSWORD;
  if (!baseUrl || !email || !password) fail('--verify-production-login requires AUTH_TEST_BASE_URL, AUTH_TEST_EMAIL, and AUTH_TEST_PASSWORD.');
  const login = await fetch(new URL('/api/admin/auth/login', baseUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), redirect: 'manual' });
  if (!login.ok) fail(`Production login verification failed with HTTP ${login.status}.`);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) fail('Production login verification did not return a session cookie.');
  const session = await fetch(new URL('/api/admin/auth/session', baseUrl), { headers: { Cookie: cookie } });
  if (!session.ok) fail(`Production session verification failed with HTTP ${session.status}.`);
  console.log('OK: production login and session verification succeeded.');
}

await runDiagnostics();
if (verifyProductionLogin) await verifyLogin();
if (diagnosticsOnly) {
  console.log('Diagnostics complete. No provisioning writes performed.');
  process.exit(0);
}
if (!execute) {
  console.log('Dry run complete. No writes performed. Re-run with --execute and selected temporary password env vars to provision users.');
  for (const user of selectedUsers) {
    const existing = await findUser(user.email);
    console.log(`- ${user.email}: ${existing ? 'would update role/status and reset password' : 'would create active user and set password'}; role=${user.role}; full_name=${user.fullName}`);
  }
  process.exit(0);
}

console.log('Executing targeted admin user provisioning. Passwords and secrets will not be printed.');
for (const user of selectedUsers) {
  const existing = await findUser(user.email);
  const userId = existing?.id || (await createUser(user));
  await setPassword(userId, process.env[user.passwordEnv]);
  await updateUser(userId, user);
  await clearUserSessions(userId);
  console.log(`${existing ? 'Updated' : 'Created'} ${user.email}; role=${user.role}; is_active=true; old sessions for this user cleared.`);
}
console.log('Provisioning complete. Share temporary passwords out-of-band and rotate them after sign-in.');
