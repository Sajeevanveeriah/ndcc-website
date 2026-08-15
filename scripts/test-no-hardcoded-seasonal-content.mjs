import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const constants = readFileSync('lib/constants.ts', 'utf8');
const fallback = readFileSync('lib/fallback-content.ts', 'utf8');
for (const name of ['COMMITTEE','TEAMS','PRODUCTS','SEED_NEWS','SEED_SPONSORS','SEED_EVENTS','SEASON_APPOINTMENTS']) {
  assert.match(constants, new RegExp(`export const ${name}:[^=]+ = \\[\\];`));
}
assert.match(constants, /SEED_SPONSOR_DESCRIPTIONS: Record<string, string> = \{\};/);
for (const prohibited of ['2025/26 Season Complete','2026/27 season begins','Craig Hillgrove','Kelsey Allan','GCA Grade 4','Dino Lotto has 50 numbers','price: 65']) {
  assert.ok(!constants.includes(prohibited), `constants must not include ${prohibited}`);
}
assert.ok(!fallback.includes('2025/26 Season Complete'));
assert.ok(!fallback.includes('Updated links for 2026/27'));
assert.match(fallback, /Season information unavailable/);
for (const file of ['app/admin/publications/page.tsx', 'app/admin/season-appointments/page.tsx', 'app/sponsors/page.tsx']) {
  const source = readFileSync(file, 'utf8');
  assert.ok(!/2025\/(?:26|2026)/.test(source), `${file} must not expose the old 2025/2026 season.`);
}
const currentSeasonContentMigration = readFileSync('supabase/migrations/20260815053000_current_season_content_cleanup.sql', 'utf8');
assert.match(currentSeasonContentMigration, /home\.season_status/);
assert.match(currentSeasonContentMigration, /fixtures\.status/);
assert.match(currentSeasonContentMigration, /fixtures\.team_links/);
assert.ok(!/2025\/(?:26|2026)/.test(currentSeasonContentMigration), 'Current-season cleanup migration must not republish 2025/2026 wording.');
console.log('No hard-coded seasonal content checks passed.');
