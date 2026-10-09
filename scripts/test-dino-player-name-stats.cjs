const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}

const summary = JSON.parse(fs.readFileSync('data/dino-coach-2025-26-summary.json', 'utf8'));
const researched = JSON.parse(fs.readFileSync('data/dino-coach-researched-baselines-20260924.json', 'utf8'));
const external = JSON.parse(fs.readFileSync('data/dino-coach-external-baselines-20260916.json', 'utf8'));
const { historicalPlayerStats } = load('lib/dino-coach/player-stats.ts', {
  '@/data/dino-coach-2025-26-summary.json': { default: summary },
  '@/data/dino-coach-researched-baselines-20260924.json': { default: researched },
  '@/data/dino-coach-external-baselines-20260916.json': { default: external },
  './domain': load('lib/dino-coach/domain.ts', {}),
});

for (const [id, oldName, newName, runs, wickets, catches] of [
  ['fc7b8d01-e5f5-4a77-88b9-f7da7561952e', 'D Whitworth', 'Daniel Whitworth', 426, 14, 4],
  ['c928fc73-2c37-430b-99f9-d5edba97625d', 'Harro Harrison', 'Daniel Harrison', 139, 12, 7],
  ['d8cd5eb8-1716-4a59-9b10-61935e0e32c4', 'Scaff Scaffidi', 'Antonio Scaffidi', 22, 1, 1],
]) {
  const before = historicalPlayerStats(id, oldName, external.seasonId);
  const after = historicalPlayerStats(id, newName, external.seasonId);
  assert.ok(after, `${newName} must retain historical statistics`);
  assert.deepEqual(after, before, 'A display-name correction must preserve every statistic');
  assert.equal(after.runs, runs);
  assert.equal(after.wickets, wickets);
  assert.equal(after.catches, catches);
  assert.equal(after.period, '2025/2026');
  assert.equal(historicalPlayerStats(id, newName, 'unrelated-season'), null);
}
// Antonio's U17 figures must not inflate the senior catalogue totals.
assert.equal(historicalPlayerStats('unknown', 'Unknown Player', external.seasonId), null);
const troy = historicalPlayerStats('9702f262-d31b-43e5-bde8-aa5a692eba02', 'Troy Whitworth', external.seasonId);
assert.equal(troy.runs, 116, 'Other Whitworth identities must remain separate');
assert.equal(troy.wickets, 3);
console.log('PASS corrected player names preserve senior historical statistics, season scope and separate identities');
