// lib/playhq/fantasy-orchestrator.ts keeps runFantasyOrchestrator and
// re-exports the rest of the public API; its steps live in
// lib/playhq/orchestrator/. Source-level regression tests assert against the
// concatenation of all of them, entry file first.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const FANTASY_ORCHESTRATOR_SOURCE_FILES = [
  'lib/playhq/fantasy-orchestrator.ts',
  'lib/playhq/orchestrator/shared.ts',
  'lib/playhq/orchestrator/discovery.ts',
  'lib/playhq/orchestrator/publish.ts',
  'lib/playhq/orchestrator/alerts.ts',
  'lib/playhq/orchestrator/advance.ts',
  'lib/playhq/orchestrator/health.ts',
];

export function readFantasyOrchestratorSource() {
  return FANTASY_ORCHESTRATOR_SOURCE_FILES
    .map((file) => readFileSync(path.join(repoRoot, file), 'utf8'))
    .join('\n');
}
