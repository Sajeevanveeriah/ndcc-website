import assert from 'node:assert/strict';
let presentation;
let marquee;
try {
  presentation = await import('../lib/sponsor-presentation.ts');
  marquee = await import('../lib/sponsor-marquee.ts');
} catch {
  assert.fail('Sponsor presentation helpers are not implemented yet.');
}
const { sortSponsorsAlphabetically } = presentation;
const { normaliseSponsorMarqueeSpeed, sponsorMarqueeDurationSeconds } = marquee;

const sponsors = [
  { id: '3', name: 'the Breakwater Hotel' },
  { id: '1', name: 'APCO Newcomb' },
  { id: '2', name: 'Blackmans Brewery' },
];

assert.deepEqual(
  sortSponsorsAlphabetically(sponsors).map((sponsor) => sponsor.name),
  ['APCO Newcomb', 'Blackmans Brewery', 'the Breakwater Hotel'],
  'Sponsors must render as one case-insensitive A-Z list.',
);
assert.deepEqual(sponsors.map((sponsor) => sponsor.id), ['3', '1', '2'], 'Sorting must not mutate CMS data.');

assert.equal(normaliseSponsorMarqueeSpeed('slow'), 'slow');
assert.equal(normaliseSponsorMarqueeSpeed('very_slow'), 'very_slow');
assert.equal(normaliseSponsorMarqueeSpeed('unexpected'), 'slow');
assert.equal(sponsorMarqueeDurationSeconds('slow', 15), 75);
assert.equal(sponsorMarqueeDurationSeconds('very_slow', 15), 105);
assert.ok(sponsorMarqueeDurationSeconds('slow', 3) >= 60, 'The sponsor marquee must remain slow with a short list.');

console.log('Sponsor A-Z list and marquee speed checks passed.');
