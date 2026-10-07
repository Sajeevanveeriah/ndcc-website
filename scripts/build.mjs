#!/usr/bin/env node
// Runs `next build` with a capped V8 heap. Vercel production builds were killed
// for running out of memory while compiling (SIGKILL, 7 Oct 2026): without a
// cap, Node sizes each build worker's heap from the machine's total memory, so
// workers grow until the container is killed instead of collecting garbage.
// The full build peaks at about 2.7 GB across all processes, so 3 GB per
// process leaves headroom. NODE_OPTIONS is inherited by Next's build workers.
// An existing NODE_OPTIONS (e.g. set in Vercel) is kept and wins.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const BUILD_HEAP_MB = 3072;

export function buildNodeOptions(existing = '') {
  if (/--max-old-space-size=/.test(existing)) return existing.trim();
  return `${existing} --max-old-space-size=${BUILD_HEAP_MB}`.trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
  const child = spawn(process.execPath, [nextBin, 'build', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: buildNodeOptions(process.env.NODE_OPTIONS || '') },
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`next build was stopped by ${signal}`);
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
}
