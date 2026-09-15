import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => { if (!(name in imports)) throw new Error(name); return imports[name]; }, Map, Set, Number, Math });
  return exports;
}
const domain = load('lib/dino-coach/domain.ts');
const summary = load('lib/dino-coach/season-summary.ts', { './domain': domain });
const source = JSON.parse(readFileSync('data/dino-coach-2025-26-summary.json', 'utf8'));
const rows = summary.aggregateSeasonSummary(source.rows);
assert.equal(source.rows.length, 154);
assert.equal(rows.length, 91);
const ranked = rows.sort((a, b) => b.points - a.points);
assert.equal(ranked[0].name, 'Anthony Quarrell');
assert.equal(ranked[0].points, 913);
assert.equal(summary.summaryOpeningPrice(913, 913), 2_000_000);
assert.equal(summary.summaryOpeningPrice(0, 913), 500_000);
assert.equal(rows.find(p => p.name === 'Rueben Brady').points, 876);
assert.equal(rows.find(p => p.name === 'Scott Evans').completeMatches, false);
assert.equal(rows.find(p => p.name === 'Scott Evans').matches, 0);
for (const keeper of source.keepers) assert.equal(summary.inferCricketRole(keeper, 300, 20, source.keepers), 'WK');
assert.equal(summary.inferCricketRole('A', 600, 20, []), 'AR');
assert.equal(summary.inferCricketRole('A', 600, 0, []), 'BAT');
assert.equal(summary.inferCricketRole('A', 20, 20, []), 'BOWL');
assert.equal(summary.inferCricketRole('A', 0, 0, []), 'UNASSIGNED');
assert.throws(() => summary.aggregateSeasonSummary([source.rows[0], source.rows[0]]), /Duplicate/);
assert.throws(() => summary.aggregateSeasonSummary([{ ...source.rows[0], runs: -1 }]), /Invalid/);
const prices = ranked.map(p => summary.summaryOpeningPrice(p.points, ranked[0].points));
assert(prices.every((p, i) => p >= 500_000 && p <= 2_000_000 && (!i || p <= prices[i - 1])));
assert(prices.slice(0, 15).reduce((a, b) => a + b, 0) > 20_000_000);
assert(prices.slice(-15).reduce((a, b) => a + b, 0) < 20_000_000);
console.log('PASS summary extraction, aggregation, missing evidence, roles, exact top price, monotonic prices and squad affordability');
