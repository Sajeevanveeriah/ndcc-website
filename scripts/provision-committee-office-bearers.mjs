#!/usr/bin/env node
// DEPRECATED: use scripts/admin/provision-users.mjs (npm run admin:provision-users),
// which supports diagnostics, per-user selection and production login checks.
//
// Dry-run by default. Writes require BOTH --execute and --confirm-production
// (same guard as scripts/production/apply-closeout.mjs).
import { createClient } from '@supabase/supabase-js';

const execute = process.argv.includes('--execute');
const confirm = process.argv.includes('--confirm-production');
const writeMode = execute && confirm;

console.warn('DEPRECATED: scripts/provision-committee-office-bearers.mjs is superseded by scripts/admin/provision-users.mjs (npm run admin:provision-users). It will be removed in a future release.');
console.log(`Office-bearer provisioning (${writeMode ? 'execute' : 'dry-run'}). Secrets will not be printed.`);
if (execute && !confirm) {
  console.error('--execute also requires --confirm-production. No writes performed.');
  process.exit(1);
}

// The vice-president password may be supplied under either name; the newer
// provision-users script uses NDCC_VP_TEMP_PASSWORD.
const vicePresidentPassword = process.env.NDCC_VP_TEMP_PASSWORD || process.env.NDCC_VICE_PRESIDENT_TEMP_PASSWORD;

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', ...(writeMode ? ['NDCC_PROVISIONING_ADMIN_ID', 'NDCC_PRESIDENT_TEMP_PASSWORD'] : [])];
const missing = required.filter((key) => !process.env[key]);
if (writeMode && !vicePresidentPassword) missing.push('NDCC_VP_TEMP_PASSWORD (or NDCC_VICE_PRESIDENT_TEMP_PASSWORD)');
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const users = [
  { email: 'ndsc.cricket@gmail.com', fullName: 'John Elliott', role: 'president', password: process.env.NDCC_PRESIDENT_TEMP_PASSWORD },
  { email: 'ndcc.vicepres@gmail.com', fullName: 'Troy Whitworth', role: 'committee', password: vicePresidentPassword },
];

if (writeMode) {
  for (const user of users) {
    if (!user.password || user.password.length < 14) {
      console.error(`${user.fullName} temporary password must be supplied by environment and be at least 14 characters.`);
      process.exit(1);
    }
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (const user of users) {
  const { data: existing, error: existingError } = await supabase
    .from('committee_users')
    .select('id')
    .eq('email', user.email)
    .maybeSingle();

  if (existingError) throw existingError;

  if (!writeMode) {
    console.log(`[dry-run] Would ${existing?.id ? 'update, reset the temporary password of and revoke sessions for' : 'create'} ${user.fullName} (${user.email}) as ${user.role}.`);
    continue;
  }

  if (existing?.id) {
    const { error: passwordError } = await supabase.rpc('ndcc_set_committee_password', {
      p_user_id: existing.id,
      p_password: user.password,
    });
    if (passwordError) throw passwordError;

    const { error: updateError } = await supabase
      .from('committee_users')
      .update({ full_name: user.fullName, role: user.role, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (updateError) throw updateError;

    await supabase.from('committee_sessions').delete().eq('user_id', existing.id);
    console.log(`Updated ${user.fullName} (${user.email}); active session tokens revoked.`);
    continue;
  }

  const { error: createError } = await supabase.rpc('ndcc_admin_create_committee_user', {
    p_email: user.email,
    p_full_name: user.fullName,
    p_role: user.role,
    p_password: user.password,
    p_created_by: process.env.NDCC_PROVISIONING_ADMIN_ID,
  });
  if (createError) throw createError;

  console.log(`Created ${user.fullName} (${user.email}).`);
}

if (!writeMode) {
  console.log('Dry run complete. No writes performed. Re-run with --execute --confirm-production to provision.');
} else {
  console.log('Provisioning complete. Share each temporary password out-of-band and replace it immediately after first sign-in.');
}
