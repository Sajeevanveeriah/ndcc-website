#!/usr/bin/env node
// Behavioural tests for the homepage season-appointments marquee plan: the
// full active collection must render uncapped in CMS order, the duplicate
// sequence stays aria-hidden, and the zero/one-item edge cases stay stable.
//
// lib/season-appointments-marquee.ts imports './public-content-normalizers',
// which plain `node --experimental-strip-types` cannot resolve without an
// extension. Modules are copied into a temp dir with specifiers rewritten
// before importing; sources are never modified.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const tmpDir = join(scriptsDir, '.season-appointments-marquee-tmp');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`PASS ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
for (const name of ['public-content-normalizers.ts', 'season-appointments-marquee.ts']) {
  const source = readFileSync(join(repoRoot, 'lib', name), 'utf8')
    .replace(/from '\.\/public-content-normalizers'/g, "from './public-content-normalizers.ts'");
  writeFileSync(join(tmpDir, name), source);
}

const { planSeasonAppointmentsMarquee, MARQUEE_SECONDS_PER_ITEM } = await import(
  pathToFileURL(join(tmpDir, 'season-appointments-marquee.ts')).href
);

function fixture(overrides) {
  return {
    id: 'id-0',
    name: 'Fixture Player',
    role: 'First XI',
    image_url: '/images/fixture-player.webp',
    announcement_date: '2026-07-01',
    sort_order: 1,
    is_active: true,
    ...overrides,
  };
}

// Six fixtures in CMS order (sort_order asc, then announcement_date desc, then
// name asc) — deliberately not alphabetical so a client-side re-sort fails.
const sixAppointments = [
  fixture({ id: 'id-1', name: 'Craig Hillgrove', role: 'Head Coach', image_url: '/images/Craig_Hillgrove.png', sort_order: 1 }),
  fixture({ id: 'id-2', name: 'Zara Fixture', role: 'Captain', image_url: 'https://example.supabase.co/storage/appointments/zara.webp', sort_order: 2 }),
  fixture({ id: 'id-3', name: 'Alan Fixture', role: 'Vice Captain', image_url: null, sort_order: 3 }),
  fixture({ id: 'id-4', name: 'Mia Fixture', role: 'Womens Coach', image_url: ' /images/mia-fixture.webp ', sort_order: 4, announcement_date: '2026-07-05' }),
  fixture({ id: 'id-5', name: 'Ben Fixture', role: 'Re-signed', image_url: '/images/ben-fixture.webp', sort_order: 4, announcement_date: '2026-07-02' }),
  fixture({ id: 'id-6', name: 'Owen Fixture', role: 'Signed', image_url: '/images/owen-fixture.webp', sort_order: 5 }),
];

try {
  const plan = planSeasonAppointmentsMarquee(sixAppointments);

  // --- every appointment renders, exactly once, in CMS order ---
  check('all six fixtures are kept (no four-item cap)', plan.appointments.length === 6);
  check('no appointment is omitted', sixAppointments.every((item) => plan.appointments.some((prepared) => prepared.id === item.id)));
  check('each appointment appears exactly once in the primary sequence', new Set(plan.appointments.map((item) => item.id)).size === plan.appointments.length);
  check('CMS order is preserved without client-side re-sorting', plan.appointments.map((item) => item.id).join(',') === sixAppointments.map((item) => item.id).join(','));
  check('names survive untouched', plan.appointments.map((item) => item.name).join(',') === sixAppointments.map((item) => item.name).join(','));

  // --- image normalisation still flows through normalizeSeasonAppointmentImage ---
  check('legacy mapped image is normalised', plan.appointments[0].image_url === '/images/season-appointments/2026-27/craig-hillgrove-head-coach-2026-27.webp');
  check('remote image URLs pass through', plan.appointments[1].image_url === 'https://example.supabase.co/storage/appointments/zara.webp');
  check('missing image stays null for the initials fallback', plan.appointments[2].image_url === null);
  check('local image paths are trimmed', plan.appointments[3].image_url === '/images/mia-fixture.webp');

  // --- marquee structure: one accessible sequence + one hidden duplicate ---
  check('two sequences render for the seamless loop', plan.sequences.length === 2);
  check('primary sequence is accessible', plan.sequences[0].key === 'primary' && plan.sequences[0].isDuplicate === false);
  check('duplicate sequence is flagged for aria-hidden', plan.sequences[1].key === 'duplicate' && plan.sequences[1].isDuplicate === true);
  check('exactly one duplicate sequence exists', plan.sequences.filter((sequence) => sequence.isDuplicate).length === 1);
  check('marquee animates with multiple cards', plan.animate === true);
  check('scroll pace stays constant per card', plan.durationSeconds === 6 * MARQUEE_SECONDS_PER_ITEM);
  check('per-card pace matches the original four-card 42s timing', 4 * MARQUEE_SECONDS_PER_ITEM === 42);

  // --- zero appointments: nothing to animate ---
  const emptyPlan = planSeasonAppointmentsMarquee([]);
  check('zero appointments produce an empty list', emptyPlan.appointments.length === 0);
  check('zero appointments never animate an empty track', emptyPlan.animate === false);

  // --- one appointment: static card, no duplicate loop ---
  const singlePlan = planSeasonAppointmentsMarquee([fixture({ id: 'solo-1', name: 'Solo Fixture' })]);
  check('single appointment renders', singlePlan.appointments.length === 1);
  check('single appointment renders statically', singlePlan.animate === false);
  check('single appointment has no duplicate sequence', singlePlan.sequences.length === 1 && singlePlan.sequences[0].isDuplicate === false);

  // --- runtime API replacement with more than four appointments stays uncapped ---
  const initialPlan = planSeasonAppointmentsMarquee(sixAppointments.slice(0, 2));
  const runtimePlan = planSeasonAppointmentsMarquee(sixAppointments);
  check('runtime refresh grows the plan past the initial payload', initialPlan.appointments.length === 2 && runtimePlan.appointments.length === 6);

  // --- production-scale collection (22 active appointments today) ---
  const twentyTwo = Array.from({ length: 22 }, (_, index) =>
    fixture({ id: `bulk-${index + 1}`, name: `Bulk Fixture ${index + 1}`, sort_order: index + 1 }));
  const bulkPlan = planSeasonAppointmentsMarquee(twentyTwo);
  check('22 active appointments all render', bulkPlan.appointments.length === 22);
  check('22-card order is preserved', bulkPlan.appointments.map((item) => item.id).join(',') === twentyTwo.map((item) => item.id).join(','));
  check('22-card duplicate stays hidden', bulkPlan.sequences.filter((sequence) => sequence.isDuplicate).length === 1);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`${failures} season-appointments marquee check(s) failed.`);
  process.exit(1);
}
console.log('Season-appointments marquee behavioural checks passed.');
