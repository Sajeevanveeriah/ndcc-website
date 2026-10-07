// The production build runs through scripts/build.mjs, which caps each Node
// process's heap so Vercel's build container is not OOM-killed (7 Oct 2026).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILD_HEAP_MB, buildNodeOptions } from './build.mjs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(pkg.scripts.build, 'node scripts/build.mjs', 'build goes through the capped launcher (cross-platform, no shell env syntax)');
assert.equal(buildNodeOptions(''), `--max-old-space-size=${BUILD_HEAP_MB}`);
assert.equal(buildNodeOptions('--enable-source-maps'), `--enable-source-maps --max-old-space-size=${BUILD_HEAP_MB}`);
assert.equal(buildNodeOptions('--max-old-space-size=6144'), '--max-old-space-size=6144', 'an explicit setting (e.g. Vercel env) wins');
assert.ok(BUILD_HEAP_MB >= 3072, 'the measured peak is ~2.7 GB in total; keep per-process headroom');

const config = readFileSync('next.config.mjs', 'utf8');
assert.match(config, /webpackMemoryOptimizations: true/);
assert.match(config, /cpus: 2/);

console.log('PASS: production build runs with a capped heap and lower-memory webpack settings.');
