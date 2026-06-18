#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const REQUIRED_ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const PASSWORD_ENV_BY_EMAIL = {
  'sajeevanveeriah@gmail.com': 'NDCC_SAJ_TEMP_PASSWORD',
  'ndsc.cricket@gmail.com': 'NDCC_PRESIDENT_TEMP_PASSWORD',
  'ndcc.vicepres@gmail.com': 'NDCC_VP_TEMP_PASSWORD',
};

const users = [
  { email: 'sajeevanveeriah@gmail.com', fullName: 'Sajeevan Veeriah', role: 'admin' },
  { email: 'ndsc.cricket@gmail.com', fullName: 'John Elliott', role: 'president' },
  { email: 'ndcc.vicepres@gmail.com', fullName: 'Troy Whitworth', role: 'committee' },
];

const args = new Set(process.argv.slice(2));
const execute = args.has('--execute');
const diagnosticsOnly = args.has('--diagnostics');
const unknownArgs = [...args].filter((arg) => !['--execute', '--diagnostics'].includes(arg));

if (unknownArgs.length) {
  console.error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  console.error('Usage: npm run admin:provision-users -- [--diagnostics] [--execute]');
  process.exit(1);
}

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

if (execute) {
  const missingPasswords = users
    .map((user) => PASSWORD_ENV_BY_EMAIL[user.email])
    .filter((key) => !process.env[key]);

  if (missingPasswords.length) {
    console.error(`Missing required temporary password environment variables for --execute: ${missingPasswords.join(', ')}`);
    process.exit(1);
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function fail(message, error) {
  console.error(message);
  if (error) {
    console.error(error.message || error);
  }
  process.exit(1);
}

async function verifyTable(tableName) {
  const { error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
  if (error) {
    fail(`Diagnostics failed: ${tableName} table is not available.`, error);
  }
  console.log(`OK: ${tableName} table is available.`);
}

async function verifyLoginRpcExists() {
  const impossiblePassword = `diagnostic-${randomUUID()}`;
  const { error } = await supabase.rpc('ndcc_verify_committee_user', {
    p_email: 'diagnostic@example.invalid',
    p_password: impossiblePassword,
  });

  if (error) {
    fail('Diagnostics failed: ndcc_verify_committee_user RPC is not available.', error);
  }
  console.log('OK: ndcc_verify_committee_user RPC is available.');
}


async function verifySetPasswordRpcExists() {
  const { error } = await supabase.rpc('ndcc_set_committee_password', {
    p_user_id: randomUUID(),
    p_password: `diagnostic-${randomUUID()}`,
  });

  if (error) {
    fail('Diagnostics failed: ndcc_set_committee_password RPC is not available.', error);
  }
  console.log('OK: ndcc_set_committee_password RPC is available.');
}

async function printSafeUserStatus() {
  const emails = users.map((user) => user.email);
  const { data, error } = await supabase
    .from('committee_users')
    .select('email, full_name, role, is_active')
    .or(emails.map((email) => `email.ilike.${email}`).join(','))
    .order('email', { ascending: true });

  if (error) {
    fail('Unable to read safe committee user status.', error);
  }

  const byEmail = new Map((data || []).map((user) => [String(user.email).toLowerCase(), user]));
  console.log('Safe user status:');
  for (const user of users) {
    const existing = byEmail.get(user.email);
    if (!existing) {
      console.log(`- ${user.email}: missing`);
      continue;
    }

    console.log(`- ${existing.email}: full_name=${existing.full_name}; role=${existing.role}; is_active=${existing.is_active}`);
  }
}

async function runDiagnostics() {
  console.log('Running safe admin auth diagnostics...');
  await verifyTable('committee_users');
  await verifyLoginRpcExists();
  await verifySetPasswordRpcExists();
  await verifyTable('committee_sessions');
  await printSafeUserStatus();
}

async function findUser(email) {
  const { data, error } = await supabase
    .from('committee_users')
    .select('id, email, full_name, role, is_active')
    .ilike('email', email)
    .maybeSingle();

  if (error) {
    fail(`Unable to look up ${email}.`, error);
  }

  return data;
}

async function setPassword(userId, password) {
  const { error } = await supabase.rpc('ndcc_set_committee_password', {
    p_user_id: userId,
    p_password: password,
  });

  if (error) {
    fail('Password reset failed before session cleanup.', error);
  }
}

async function clearUserSessions(userId) {
  const { error } = await supabase.from('committee_sessions').delete().eq('user_id', userId);
  if (error) {
    fail('Password was reset, but old session cleanup failed.', error);
  }
}

async function updateUser(userId, user) {
  const { error } = await supabase
    .from('committee_users')
    .update({
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    fail(`Unable to update ${user.email}.`, error);
  }
}

async function createUser(user) {
  const { data, error } = await supabase
    .from('committee_users')
    .insert({
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      is_active: true,
      password_hash: `provisioning-pending-${randomUUID()}`,
    })
    .select('id')
    .single();

  if (error) {
    fail(`Unable to create ${user.email}.`, error);
  }

  return data.id;
}

await runDiagnostics();

if (diagnosticsOnly) {
  console.log('Diagnostics complete. No writes performed.');
  process.exit(0);
}

if (!execute) {
  console.log('Dry run complete. No writes performed. Re-run with --execute and required temporary password env vars to provision users.');
  for (const user of users) {
    const existing = await findUser(user.email);
    const action = existing ? 'would update role/status and reset password' : 'would create active user and set password';
    console.log(`- ${user.email}: ${action}; role=${user.role}; full_name=${user.fullName}`);
  }
  process.exit(0);
}

console.log('Executing admin user provisioning. Passwords and secrets will not be printed.');
for (const user of users) {
  const existing = await findUser(user.email);
  const password = process.env[PASSWORD_ENV_BY_EMAIL[user.email]];
  const userId = existing?.id || (await createUser(user));

  await setPassword(userId, password);
  await updateUser(userId, user);
  await clearUserSessions(userId);

  console.log(`${existing ? 'Updated' : 'Created'} ${user.email}; role=${user.role}; is_active=true; old sessions for this user cleared.`);
}

console.log('Provisioning complete. Share temporary passwords out-of-band and rotate them after sign-in.');
