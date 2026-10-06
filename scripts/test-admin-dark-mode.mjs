#!/usr/bin/env node
// Regression guard: the admin CMS must render correctly in dark mode.
//
// Scans app/admin/**/*.tsx and components/admin/**/*.tsx and fails when a line
// uses a light-only tinted Tailwind utility (pale backgrounds, grey/slate text,
// dark tinted text, pale tinted borders) without a `dark:` utility for the
// same property (bg / text / border) on the same line. Prefer the semantic
// tokens (bg-surface-*, text-content-*, border-edge-*, text-status-*) which
// adapt automatically; otherwise pair the light utility with a `dark:` one.
//
// Usage: node scripts/test-admin-dark-mode.mjs [--list]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['app/admin', 'components/admin'];

const TINTS = 'red|green|yellow|amber|blue|indigo|purple|teal|orange|emerald|sky|rose|pink|cyan|lime|violet|fuchsia';
const NEUTRALS = 'gray|slate|zinc|neutral|stone';

// Each rule: property family + regex for the offending utility (optionally
// behind variants such as hover:, focus:, sm:), never already behind dark:.
const RULES = [
  { family: 'bg', re: new RegExp(`(?<![\\w:-])((?:[a-z-]+:)*)bg-(?:white(?![\\w/-])|(?:${NEUTRALS}|${TINTS})-(?:50|100|200)(?![\\w-]))`, 'g') },
  { family: 'text', re: new RegExp(`(?<![\\w:-])((?:[a-z-]+:)*)text-(?:${NEUTRALS})-(?:300|400|500|600|700|800|900)(?![\\w-])`, 'g') },
  { family: 'text', re: new RegExp(`(?<![\\w:-])((?:[a-z-]+:)*)text-(?:${TINTS})-(?:600|700|800|900)(?![\\w-])`, 'g') },
  { family: 'border', re: new RegExp(`(?<![\\w:-])((?:[a-z-]+:)*)border(?:-[trblxy])?-(?:${NEUTRALS}|${TINTS})-(?:100|200|300)(?![\\w-])`, 'g') },
];

// Intentional light-only usages, keyed by "relative/path.tsx" -> reason.
// Every line in an allowlisted file is skipped, so keep this list short.
const ALLOWLIST_FILES = {};
// Individual lines: a substring that identifies the line, with a reason.
const ALLOWLIST_LINES = [
  // {
  //   file: 'components/admin/Example.tsx',
  //   contains: 'unique snippet',
  //   reason: 'why this is intentional in both themes',
  // },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

export function findViolations(source, rel = '') {
  const violations = [];
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (ALLOWLIST_LINES.some((a) => a.file === rel && line.includes(a.contains))) return;
    // Check each string segment separately (quotes and template `${ }` split
    // segments), so a ternary branch with a dark: pair does not excuse the
    // other branch.
    for (const segment of line.split(/['"`]|\$\{|\}/)) {
      for (const { family, re } of RULES) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(segment))) {
          const variants = m[1] ?? '';
          if (variants.includes('dark:')) continue;
          const darkPair = new RegExp(`dark:(?:[a-z-]+:)*${family}(?:-[trblxy])?-`);
          if (darkPair.test(segment)) continue;
          violations.push({ line: i + 1, utility: m[0], text: trimmed });
        }
      }
    }
  });
  return violations;
}

function selfTest() {
  const cases = [
    ['className="bg-gray-200 animate-pulse"', 1],
    ['className="bg-gray-200 dark:bg-slate-700"', 0],
    ['className="text-red-600"', 1],
    ['className="text-red-600 dark:text-red-300"', 0],
    ['className="text-gray-400 hover:bg-gray-100"', 2],
    ['className="text-gray-400 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"', 0],
    ['className="border border-amber-300 bg-amber-50 dark:bg-amber-950"', 1],
    ['className="bg-white/10 text-white"', 0],
    ['className="bg-surface-card text-content-muted border-edge-subtle"', 0],
    ['className="bg-red-600 text-white"', 0],
    ['// bg-gray-200 in a comment', 0],
    ["className={ok ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50'}", 1],
    ['<p className="text-red-600">x</p><p className="text-green-700 dark:text-green-300">y</p>', 1],
  ];
  for (const [src, expected] of cases) {
    const got = findViolations(src).length;
    if (got !== expected) {
      console.error(`self-test failed: ${src} -> ${got} violations, expected ${expected}`);
      process.exit(1);
    }
  }
}

function main() {
  selfTest();
  const files = ROOTS.flatMap((r) => walk(path.join(repoRoot, r)));
  const all = [];
  for (const file of files) {
    const rel = path.relative(repoRoot, file).split(path.sep).join('/');
    if (Object.hasOwn(ALLOWLIST_FILES, rel)) continue;
    for (const v of findViolations(readFileSync(file, 'utf8'), rel)) all.push({ file: rel, ...v });
  }
  if (process.argv.includes('--list') || all.length) {
    for (const v of all) console.log(`${v.file}:${v.line}  ${v.utility}`);
  }
  if (all.length) {
    const lines = new Set(all.map((v) => `${v.file}:${v.line}`)).size;
    console.error(
      `\nFAIL  ${all.length} light-only utilities on ${lines} lines in admin without a dark: pair.\n` +
        'Use semantic tokens (bg-surface-*, text-content-*, border-edge-*, text-status-*) or add a dark: variant.',
    );
    process.exit(1);
  }
  console.log(`PASS  admin dark mode: ${files.length} files scanned, no unpaired light-only utilities.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
