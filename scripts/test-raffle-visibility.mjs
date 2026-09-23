import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isRaffleVisibleAt } from '../lib/raffle-visibility-rules.ts';

const opensAt = '2026-09-08T14:00:00.000Z'; // 9 September 2026, 12:00 am Melbourne time.
const scheduled = { active: true, public_visibility_mode: 'scheduled', public_opens_at: opensAt };
assert.equal(isRaffleVisibleAt(scheduled, new Date('2026-09-08T13:59:59.999Z')), false);
assert.equal(isRaffleVisibleAt(scheduled, new Date(opensAt)), true);
assert.equal(isRaffleVisibleAt({ ...scheduled, public_visibility_mode: 'hidden' }, new Date('2026-12-01T00:00:00Z')), false);
assert.equal(isRaffleVisibleAt({ ...scheduled, public_visibility_mode: 'visible' }, new Date('2026-08-23T00:00:00Z')), true);
assert.equal(isRaffleVisibleAt({ ...scheduled, active: false }, new Date('2026-12-01T00:00:00Z')), false);

const requiredGates = [
  // Navbar and Footer share one server-computed visibility snapshot.
  ['lib/server/nav-visibility.ts', 'isRafflePublic()'],
  ['lib/server/nav-visibility.ts', "isRafflePublic('NDCCRRO')"],
  ['components/layout/Navbar.tsx', 'nav.rafflePublic'],
  ['components/layout/Navbar.tsx', 'nav.reverseRafflePublic'],
  ['components/layout/Footer.tsx', 'rafflePublic: raffleEnabled'],
  ['components/layout/Footer.tsx', "!link.href.startsWith('/reverse-raffle')"],
  ['app/raffle/page.tsx', 'notFound'],
  ['app/reverse-raffle/page.tsx', "getPublicRaffleCampaign('NDCCRRO')"],
  ['app/api/raffle/checkout/route.ts', 'getPublicRaffleCampaign'],
  ['app/sitemap.ts', 'isRaffleVisibleAt'],
];
for (const [file, marker] of requiredGates) assert.ok(fs.readFileSync(file, 'utf8').includes(marker), `${file} must contain ${marker}`);
console.log('Raffle visibility schedule and all public gates passed.');

