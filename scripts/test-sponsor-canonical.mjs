#!/usr/bin/env node
import aliases from '../data/sponsors/canonical-sponsor-aliases.json' with { type: 'json' };

function normalizeSponsorName(value) {
  return String(value || '').toLowerCase().replace(/[’']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}
const lookup = new Map();
for (const [canonical, names] of Object.entries(aliases)) {
  lookup.set(normalizeSponsorName(canonical), canonical);
  for (const name of names) lookup.set(normalizeSponsorName(name), canonical);
}
function canonicalSponsorName(value) { return lookup.get(normalizeSponsorName(value)) || String(value || '').trim(); }
const cases = [
  ['APCO', 'APCO Newcomb'], ['APCO Newcomb', 'APCO Newcomb'],
  ['Bennett', 'Bennett Racing'], ['Bennett Racing', 'Bennett Racing'],
  ['GP', 'General Public Corio'], ['General Public Corio', 'General Public Corio'],
  ['Mahoney', 'Mahoney Real Estate'], ['Mahoney Real Estate', 'Mahoney Real Estate'],
  ['Leopold Sportsmans Club', 'Leopold Sporties'], ['Leopold Sporties', 'Leopold Sporties'],
  ["Blackman's Brewery", 'Blackmans Brewery'], ['Blackmans Brewery', 'Blackmans Brewery'],
  ['Mustaang Cricket Bat Repairs', 'MBR Cricket'], ['MBR Cricket', 'MBR Cricket'],
];
let failed = 0;
for (const [input, expected] of cases) {
  const actual = canonicalSponsorName(input);
  if (actual !== expected) { console.error(`${input}: expected ${expected}, got ${actual}`); failed++; }
}
if (failed) process.exit(1);
console.log(`Sponsor canonicalisation test passed for ${cases.length} alias case(s).`);
