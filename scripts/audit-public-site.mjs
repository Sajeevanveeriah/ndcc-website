#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
const requiredSponsors = ['APCO Newcomb','Moolap Tyres','Elyod Roofing','CarePlus','Mahoney Real Estate','Champion Trophies','THS Hydraulics','Leopold Sporties','Murphy’s','The Breakwater Hotel','Phoenix Truck Bodies','MBR Cricket','Bennett Racing','Blackmans Brewery','General Public'];
const sponsors = JSON.parse(readFileSync('data/recovery/sponsor-discovery-20260619.json', 'utf8'));
let failed = 0;
for (const name of requiredSponsors) {
  const row = sponsors.find((s) => s.display_name === name);
  if (!row) { console.error(`Missing sponsor name: ${name}`); failed++; }
  if (row?.logo_local_path && !existsSync(`public${row.logo_local_path}`)) { console.error(`Broken local image path: ${row.logo_local_path}`); failed++; }
}
const sourceFiles = ['app/fantasy/page.tsx','app/fantasy/players/page.tsx','app/fantasy/manager-leaderboard/page.tsx','app/contact/page.tsx','app/api/contacts/route.ts','app/api/admin/auth/login/route.ts'];
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  if (/under development/i.test(text)) { console.error(`${file} contains under development text`); failed++; }
  if (/AbortError/.test(text) && !file.includes('login')) { console.error(`${file} contains raw AbortError text`); failed++; }
}
if (!readFileSync('app/api/contacts/route.ts', 'utf8').includes('dbStatus') || !readFileSync('app/api/contacts/route.ts', 'utf8').includes('emailStatus')) { console.error('Contact API lacks structured status fields.'); failed++; }
const login = readFileSync('app/api/admin/auth/login/route.ts', 'utf8');
if (!login.includes('401') || !login.includes('503')) { console.error('Admin login route lacks required 401/503 status semantics.'); failed++; }
if (failed) process.exit(1);
console.log(`Public audit passed: ${requiredSponsors.length} sponsors, local image paths, contact structure, and admin auth semantics verified.`);
