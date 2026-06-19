#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const checks = [['app/page.tsx','sponsors'],['app/about/page.tsx','committee'],['app/sponsors/page.tsx','Sponsors'],['app/join/page.tsx','Membership'],['app/contact/page.tsx','Contact'],['app/admin/login/page.tsx','login']];
let failed = 0;
for (const [file, needle] of checks) { const text = readFileSync(file,'utf8'); if (!text.toLowerCase().includes(needle.toLowerCase())) { console.error(`${file} missing ${needle}`); failed++; } }
if (failed) process.exit(1);
console.log(`Public audit passed for ${checks.length} source page check(s).`);
