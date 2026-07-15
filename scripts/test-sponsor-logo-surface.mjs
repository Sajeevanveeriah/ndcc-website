#!/usr/bin/env node
// Deterministic regression tests for the sponsor logo plate system:
// mode normalisation, auto-mode allowlist resolution (Bennett Racing /
// MBR Cricket keep their dark plate), explicit CMS overrides, and the
// plate classes that keep artwork legible in both themes.
//
// The `@/lib/...` alias module is staged into a temp dir with the alias
// rewritten (same approach as scripts/test-fantasy-seasons.mjs).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');
const tmpDir = join(scriptsDir, '.sponsor-surface-tmp');

let failures = 0;
function check(label, condition) {
  if (condition) console.log(`PASS ${label}`);
  else { failures += 1; console.error(`FAIL ${label}`); }
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

try {
  for (const rel of ['sponsor-canonical.ts', 'sponsor-logo-surface.ts', 'sponsor-logo-analysis.ts']) {
    const source = readFileSync(join(repoRoot, 'lib', rel), 'utf8')
      .replace(/@\/lib\/([\w-]+)/g, './$1.ts')
      .replace("@/data/sponsors/canonical-sponsor-aliases.json", './canonical-sponsor-aliases.json')
      .replace("import sponsorAliases from './canonical-sponsor-aliases.json';",
        "import sponsorAliases from './canonical-sponsor-aliases.json' with { type: 'json' };");
    writeFileSync(join(tmpDir, rel), source);
  }
  writeFileSync(
    join(tmpDir, 'canonical-sponsor-aliases.json'),
    readFileSync(join(repoRoot, 'data', 'sponsors', 'canonical-sponsor-aliases.json'))
  );
  const mod = await import(pathToFileURL(join(tmpDir, 'sponsor-logo-surface.ts')).href);
  const { resolveSponsorLogoSurface, normaliseSponsorLogoSurfaceMode, sponsorLogoSurfaceClass } = mod;

  // Mode normalisation: unknown/absent values fall back to auto.
  check('normalise: null -> auto', normaliseSponsorLogoSurfaceMode(null) === 'auto');
  check('normalise: bogus -> auto', normaliseSponsorLogoSurfaceMode('sparkly') === 'auto');
  check('normalise: dark stays dark', normaliseSponsorLogoSurfaceMode('dark') === 'dark');

  // Auto resolution keeps the verified artwork allowlist.
  check('auto: Bennett Racing -> dark plate', resolveSponsorLogoSurface('Bennett Racing', 'auto') === 'dark');
  check('auto: MBR Cricket -> dark plate', resolveSponsorLogoSurface('MBR Cricket', null) === 'dark');
  check('auto: other sponsor -> light plate', resolveSponsorLogoSurface('APCO Newcomb', undefined) === 'light');

  // Explicit CMS mode wins over the allowlist.
  check('override: Bennett Racing light wins', resolveSponsorLogoSurface('Bennett Racing', 'light') === 'light');
  check('override: neutral', resolveSponsorLogoSurface('APCO Newcomb', 'neutral') === 'neutral');
  check('override: transparent', resolveSponsorLogoSurface('APCO Newcomb', 'transparent') === 'transparent');

  // Plate classes: legibility invariants.
  const light = sponsorLogoSurfaceClass('APCO Newcomb');
  check('light plate pinned white in both themes', light.includes('bg-white') && light.includes('dark:bg-white'));
  check('light plate has inset keyline for white-background logos', light.includes('ring-inset'));
  const dark = sponsorLogoSurfaceClass('Bennett Racing');
  check('dark plate uses maroon gradient', dark.includes('from-maroon-950'));
  const neutral = sponsorLogoSurfaceClass('X', 'neutral');
  check('neutral plate is pale in light and theme-following in dark', neutral.includes('bg-[#f3f1ec]') && neutral.includes('dark:bg-surface-muted'));
  check('neutral plate keeps a visible dark-mode keyline', neutral.includes('dark:ring-white/15'));
  const transparent = sponsorLogoSurfaceClass('X', 'transparent');
  check('transparent plate has no fill', transparent.includes('bg-transparent'));
  check('every plate keeps optical padding', [light, dark, neutral, transparent].every((c) => c.includes('p-5')));
  check('dark plate keeps a visible dark-mode border', dark.includes('dark:border-white/15'));

  // Pixel classifier used by the admin plate suggestion.
  const analysisModule = await import(pathToFileURL(join(tmpDir, 'sponsor-logo-analysis.ts')).href);
  const { analyseSponsorLogoPixels } = analysisModule;
  const solid = (r, g, b, a, count) => Array.from({ length: count * 4 }, (_, i) => [r, g, b, a][i % 4]);
  const whiteTransparent = { width: 4, height: 4, data: [...solid(255, 255, 255, 255, 8), ...solid(0, 0, 0, 0, 8)] };
  check('analysis: white-on-transparent -> dark plate', analyseSponsorLogoPixels(whiteTransparent).suggestedMode === 'dark');
  const blackTransparent = { width: 4, height: 4, data: [...solid(10, 10, 10, 255, 8), ...solid(0, 0, 0, 0, 8)] };
  check('analysis: black-on-transparent -> light plate', analyseSponsorLogoPixels(blackTransparent).suggestedMode === 'light');
  const builtIn = { width: 4, height: 4, data: solid(239, 195, 53, 255, 16) };
  const builtInResult = analyseSponsorLogoPixels(builtIn);
  check('analysis: full built-in background -> neutral plate', builtInResult.suggestedMode === 'neutral' && builtInResult.hasBuiltInBackground);
  check('analysis: empty sample falls back to light', analyseSponsorLogoPixels({ width: 0, height: 0, data: [] }).suggestedMode === 'light');
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (failures) { console.error(`${failures} sponsor logo surface test(s) failed.`); process.exit(1); }
console.log('Sponsor logo surface tests passed.');
