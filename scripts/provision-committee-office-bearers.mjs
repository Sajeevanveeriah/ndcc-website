#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NDCC_PROVISIONING_ADMIN_ID', 'NDCC_PRESIDENT_TEMP_PASSWORD', 'NDCC_VICE_PRESIDENT_TEMP_PASSWORD'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const users = [
  { email: 'ndsc.cricket@gmail.com', fullName: 'John Elliott', role: 'president', password: process.env.NDCC_PRESIDENT_TEMP_PASSWORD },
  { email: 'ndcc.vicepres@gmail.com', fullName: 'Troy Whitworth', role: 'committee', password: process.env.NDCC_VICE_PRESIDENT_TEMP_PASSWORD },
];

for (const user of users) {
  if (!user.password || user.password.length < 14) {
    console.error(`${user.fullName} temporary password must be supplied by environment and be at least 14 characters.`);
    process.exit(1);
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

console.log('Provisioning complete. Share each temporary password out-of-band and replace it immediately after first sign-in.');
