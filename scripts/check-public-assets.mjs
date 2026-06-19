#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
const sponsors = JSON.parse(readFileSync('data/sponsors/verified-sponsors-20260619.json', 'utf8'));
const missing = sponsors.filter((sponsor) => sponsor.logo_local_path?.startsWith('/') && !existsSync(`public${sponsor.logo_local_path}`));
if (missing.length) { console.error(`Missing assets: ${missing.map((s) => s.logo_local_path).join(', ')}`); process.exit(1); }
console.log(`Public asset check passed for ${sponsors.length} sponsor logo reference(s).`);
