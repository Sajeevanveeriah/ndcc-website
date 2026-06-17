#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const TABLES = ['sponsors','content_blocks','page_link_cards','club_settings','committee_members','season_appointments','teams','facility_features','news','events','gallery_images','social_membership_products','volunteer_positions'];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
for (const table of TABLES) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) console.log(`${table}: unavailable (${error.code || 'error'}) ${error.message}`);
  else console.log(`${table}: ${count ?? 0} public rows`);
}
