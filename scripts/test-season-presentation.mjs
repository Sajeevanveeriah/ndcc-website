import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const tmpDir = join(scriptsDir, '.season-presentation-tmp');
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
writeFileSync(join(tmpDir, 'supabase-server.ts'), 'export function createServerClient() { throw new Error("not used"); }\n');
writeFileSync(join(tmpDir, 'club-seasons.ts'), readFileSync(join(repoRoot, 'lib/club-seasons.ts'), 'utf8').replace("from './supabase-server'", "from './supabase-server.ts'"));
const seasonModule = await import(pathToFileURL(join(tmpDir, 'club-seasons.ts')).href);
const seasonContentModule = await import(pathToFileURL(join(repoRoot, 'lib/season-content.ts')).href);
assert.equal(typeof seasonModule.nextClubSeasonDraft, 'function', 'Next-season defaults are not implemented yet.');
assert.equal(typeof seasonModule.shouldShowSeasonAppointments, 'function', 'Season appointment visibility is not implemented yet.');
const { nextClubSeasonDraft, shouldShowSeasonAppointments } = seasonModule;

const current = {
  id: 'current',
  name: '2026/2027 Season',
  slug: '2026-27',
  start_date: '2026-10-01',
  end_date: '2027-03-31',
  show_season_appointments: false,
};

assert.deepEqual(nextClubSeasonDraft(current), {
  name: '2027/2028 Season',
  slug: '2027-28',
  startDate: '2027-10-01',
  endDate: '2028-03-31',
});
assert.equal(shouldShowSeasonAppointments(current), false, 'Closed 2026/2027 signings must stay hidden.');
assert.equal(shouldShowSeasonAppointments({ ...current, show_season_appointments: true }), true);
assert.equal(shouldShowSeasonAppointments(null), false, 'Missing season state must fail closed.');
assert.equal(seasonContentModule.renderSeasonContent('{season} Fixtures', current), '2026/2027 Season Fixtures');
assert.equal(seasonContentModule.renderSeasonContent('Current: {season}', null), 'Current: Current Season');

rmSync(tmpDir, { recursive: true, force: true });
console.log('Season-derived presentation checks passed.');
