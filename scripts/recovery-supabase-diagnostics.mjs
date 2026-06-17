#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const tables = [
  'sponsors',
  'committee_members',
  'season_appointments',
  'content_blocks',
  'contacts',
  'news',
  'events',
  'gallery_images',
  'site_links',
  'committee_users',
  'committee_sessions',
];

function projectHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function print(title, value) {
  console.log(`\n## ${title}`);
  console.log(JSON.stringify(value, null, 2));
}

if (!url || !key) {
  print('supabase', {
    configured: false,
    projectHost: url ? projectHost(url) : null,
    keyPresent: Boolean(key),
  });
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

print('supabase', {
  configured: true,
  projectHost: projectHost(url),
  keyPresent: true,
  keyType: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role_or_server_key' : 'anon_key',
});

const counts = {};
for (const table of tables) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  counts[table] = error ? { reachable: false, error: { code: error.code, message: error.message } } : { reachable: true, count };
}
print('tableCounts', counts);

const checks = [
  {
    title: 'latestSponsors',
    query: supabase.from('sponsors').select('id,name,tier,active,updated_at').order('updated_at', { ascending: false, nullsFirst: false }).limit(20),
  },
  {
    title: 'committeeMembers',
    query: supabase.from('committee_members').select('id,name,role,is_active,updated_at').order('sort_order', { ascending: true }).order('updated_at', { ascending: false, nullsFirst: false }),
  },
  {
    title: 'latestSeasonAppointments',
    query: supabase.from('season_appointments').select('id,name,role,is_active,updated_at').order('updated_at', { ascending: false, nullsFirst: false }).limit(20),
  },
  {
    title: 'latestContacts',
    query: supabase.from('contacts').select('id,name,email,enquiry_type,created_at,responded').order('created_at', { ascending: false }).limit(20),
  },
];

for (const check of checks) {
  const { data, error } = await check.query;
  print(check.title, error ? { reachable: false, error: { code: error.code, message: error.message } } : { reachable: true, rows: data });
}
