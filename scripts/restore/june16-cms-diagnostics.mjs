#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const TABLES = ['sponsors','content_blocks','page_link_cards','club_settings','committee_members','season_appointments','teams','facility_features','news','events','gallery_images','volunteer_positions','social_membership_plans','social_membership_addons'];
const REQUIRED_BLOCKS = ['about.hero','about.affiliation','about.goodsports','about.partnership','fixtures.hero','fixtures.status','fixtures.team_links'];
const REQUIRED_FOOTER_SECTIONS = ['footer_club','footer_get_involved','footer_more'];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function count(table, filter = (query) => query) {
  const { count, error } = await filter(supabase.from(table).select('*', { count: 'exact', head: true }));
  if (error) return { error: `${error.code || 'error'} ${error.message}` };
  return { count: count ?? 0 };
}

console.log('# June 16 CMS diagnostics');
console.log('## Row counts');
for (const table of TABLES) {
  const result = await count(table);
  console.log(`${table}: ${result.error ? `unavailable (${result.error})` : `${result.count} rows`}`);
}

console.log('## Required content checks');
const activeSponsors = await count('sponsors', (query) => query.eq('active', true));
const sponsorLogos = await count('sponsors', (query) => query.eq('active', true).or('logo_url.is.null,logo_url.eq.'));
console.log(`missing sponsor count: ${activeSponsors.error ? `unknown (${activeSponsors.error})` : activeSponsors.count === 0 ? 'all sponsors missing' : 0}`);
console.log(`sponsor records with empty logo_url: ${sponsorLogos.error ? `unknown (${sponsorLogos.error})` : sponsorLogos.count}`);
for (const key of REQUIRED_BLOCKS) {
  const result = await count('content_blocks', (query) => query.eq('block_key', key).eq('is_active', true));
  console.log(`missing content_blocks ${key}: ${result.error ? `unknown (${result.error})` : result.count === 0 ? 1 : 0}`);
}
for (const section of REQUIRED_FOOTER_SECTIONS) {
  const result = await count('page_link_cards', (query) => query.eq('page_slug', 'site').eq('section_key', section).eq('is_active', true));
  console.log(`missing footer section ${section}: ${result.error ? `unknown (${result.error})` : result.count === 0 ? 1 : 0}`);
}
const settings = await count('club_settings', (query) => query.eq('id', 'default'));
console.log(`missing club_settings default: ${settings.error ? `unknown (${settings.error})` : settings.count === 0 ? 1 : 0}`);
const fixturesLinks = await count('page_link_cards', (query) => query.eq('page_slug', 'fixtures').eq('section_key', 'team_links').eq('is_active', true));
console.log(`missing page_link_cards fixtures team_links: ${fixturesLinks.error ? `unknown (${fixturesLinks.error})` : fixturesLinks.count === 0 ? 1 : 0}`);
console.log(`missing About/Fixtures content: see required content_blocks and fixtures team_links checks above`);
for (const table of ['season_appointments','news','events','gallery_images']) {
  const result = await count(table);
  console.log(`missing ${table} records: ${result.error ? `unknown (${result.error})` : result.count === 0 ? 1 : 0}`);
}
