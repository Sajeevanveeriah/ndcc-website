#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
const sponsors = JSON.parse(readFileSync('data/sponsors/verified-sponsors-20260619.json', 'utf8'));
const required = ['APCO Newcomb','Moolap Tyres','Elyod Roofing','CarePlus','Mahoney Real Estate','Champion Trophies','THS Hydraulics','Leopold Sporties','Murphy’s','The Breakwater Hotel','Phoenix Truck Bodies','MBR Cricket','Bennett Racing','Blackmans Brewery','General Public'];
let failed = 0;
for (const name of required) {
  const row = sponsors.find((item) => item.display_name === name);
  if (!row) { console.error(`Missing sponsor ${name}`); failed++; continue; }
  if (!row.description?.trim()) { console.error(`Missing description for ${name}`); failed++; }
  if (!row.logo_local_path?.startsWith('/')) { console.error(`Missing local logo path for ${name}`); failed++; }
  else if (!existsSync(`public${row.logo_local_path}`)) { console.error(`Logo file not found for ${name}: ${row.logo_local_path}`); failed++; }
}
if (failed) process.exit(1);
console.log(`Sponsor inventory test passed for ${required.length} required sponsors.`);
