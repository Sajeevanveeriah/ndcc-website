import { readFileSync } from 'node:fs';

const files = [
  'app/fantasy/page.tsx',
  'app/fantasy/players/page.tsx',
  'app/fantasy/leaderboard/page.tsx',
  'app/fantasy/manager-leaderboard/page.tsx',
  'app/api/fantasy/manager-leaderboard/route.ts',
];

const forbidden = [
  'under development',
  'coming soon',
  'data workflow',
  'what managers can do',
  'temporarily unavailable',
  'took too long to load',
  'AbortError',
  'stack trace',
  'raw Supabase',
  'PlayHQ errors',
];

let failed = 0;
for (const file of files) {
  const content = readFileSync(file, 'utf8').toLowerCase();
  for (const phrase of forbidden) {
    if (content.includes(phrase.toLowerCase())) {
      console.error(`FAIL ${file}: contains forbidden public fantasy copy "${phrase}"`);
      failed += 1;
    }
  }
}

if (failed > 0) {
  console.error(`Fantasy public smoke check failed with ${failed} issue(s).`);
  process.exit(1);
}

console.log(`Fantasy public smoke check passed for ${files.length} file(s).`);
