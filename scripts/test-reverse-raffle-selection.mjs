import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// The selection helpers import the shared raffle constants through the '@/'
// path alias, so load both through the TypeScript transpiler with an explicit
// dependency map instead of a native ESM import.
function load(file, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require(name) { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; } });
  return exports;
}
const raffleConstants = load('lib/raffle-constants.ts', {});
const { REVERSE_RAFFLE_NUMBERS, validReverseRaffleSelection } = load('lib/reverse-raffle-selection.ts', { '@/lib/raffle-constants': raffleConstants });

assert.equal(REVERSE_RAFFLE_NUMBERS.length, 100);
assert.equal(REVERSE_RAFFLE_NUMBERS[0], 201);
assert.equal(REVERSE_RAFFLE_NUMBERS.at(-1), 300);
assert.equal(new Set(REVERSE_RAFFLE_NUMBERS).size, 100);
assert.ok(validReverseRaffleSelection([201, 250, 300], 3));
assert.ok(validReverseRaffleSelection(REVERSE_RAFFLE_NUMBERS.slice(0, 20), 20));
for (const [numbers, quantity] of [
  [undefined, 1], [null, 1], [[], 0], [[201], 2], [[201, 201], 2],
  [[200], 1], [[301], 1], [[201.5], 1], [['201'], 1], [[null], 1],
  [[201], 1.5], [REVERSE_RAFFLE_NUMBERS.slice(0, 21), 21],
]) assert.equal(validReverseRaffleSelection(numbers, quantity), false, JSON.stringify({ numbers, quantity }));
console.log('Reverse raffle selection: 100 unique numbers, boundaries, non-consecutive choices, quantity matching and invalid inputs passed.');
