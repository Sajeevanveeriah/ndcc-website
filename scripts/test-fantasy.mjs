#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const files = ['lib/fantasy-game.ts','lib/fantasy-scoring.ts','lib/fantasy-leaderboard.ts','app/fantasy/players/page.tsx','app/fantasy/squad/page.tsx','app/fantasy/transfers/page.tsx'];
for (const file of files) readFileSync(file, 'utf8');
console.log(`Fantasy structural test passed for ${files.length} core file(s).`);
