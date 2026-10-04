#!/usr/bin/env node
// Dependency audit gate for CI (security-scans job).
//
// Fails on any high or critical npm advisory, except advisories listed in
// ACCEPTED below. An accepted advisory must have no patched release, must not
// reach a production (runtime) dependency, and expires on its review date so
// the exception is revisited rather than forgotten.

import { execSync } from 'node:child_process';

const ACCEPTED = {
  // braces <= 3.0.3: stack exhaustion on deeply nested brace patterns. No
  // patched release exists. Reached only through build tooling
  // (tailwindcss 3 -> chokidar/fast-glob/micromatch, eslint-config-next ->
  // @next/eslint-plugin-next -> fast-glob -> micromatch), where the patterns
  // are the project's own config globs, never user input. Remove once braces
  // ships a fix, or once neither path remains: tailwindcss 4 has no
  // dependencies and removes the first, but eslint-config-next 15 still pins
  // fast-glob 3.3.1 and keeps braces in the tree.
  'GHSA-vfj7-8cjw-p6xm': { reviewBy: '2026-12-31' },
};

const BLOCKING = new Set(['high', 'critical']);

function audit(args) {
  try {
    // Fixed command (no user input); a string command also runs npm.cmd on Windows.
    return JSON.parse(execSync(['npm', 'audit', '--json', ...args].join(' '), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }));
  } catch (error) {
    // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

function blockingAdvisories(report) {
  const found = new Map();
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities || {})) {
    for (const via of vuln.via || []) {
      if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
      const id = String(via.url || '').match(/GHSA-[a-z0-9-]+/i)?.[0] || `npm-${via.source}`;
      const entry = found.get(id) || { id, severity: via.severity, title: via.title, packages: new Set() };
      entry.packages.add(pkg);
      found.set(id, entry);
    }
  }
  return found;
}

const today = new Date().toISOString().slice(0, 10);
const all = blockingAdvisories(audit([]));
const runtime = blockingAdvisories(audit(['--omit=dev']));
const failures = [];

for (const advisory of all.values()) {
  const accepted = ACCEPTED[advisory.id];
  const packages = [...advisory.packages].sort().join(', ');
  if (!accepted) {
    failures.push(`${advisory.severity} ${advisory.id} (${advisory.title}) in ${packages}`);
  } else if (runtime.has(advisory.id)) {
    failures.push(`${advisory.id} is accepted for build tooling only but now reaches a production dependency: ${[...runtime.get(advisory.id).packages].join(', ')}`);
  } else if (today > accepted.reviewBy) {
    failures.push(`${advisory.id} acceptance expired on ${accepted.reviewBy}; re-check for a fix and update scripts/check-npm-audit.mjs`);
  } else {
    console.log(`accepted until ${accepted.reviewBy}: ${advisory.id} (${advisory.title}) in build tooling: ${packages}`);
  }
}

if (failures.length) {
  console.error('Dependency audit failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Dependency audit passed: ${runtime.size} high/critical advisories in production dependencies, ${all.size} in total (all accepted).`);
