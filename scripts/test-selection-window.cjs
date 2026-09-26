const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
let enabled = true;
let windowOpen = false;
let rpcError = null;
const expired = { id: 'old', name: 'Old round', status: 'scored', deadline_at: '2026-01-01T00:00:00Z' };
const next = { id: 'next', name: 'Next round', status: 'open', deadline_at: '2099-01-01T00:00:00Z' };
let rounds = [next];
const db = {
  from(table) {
    let onlyOpen = false;
    const q = {
      select: () => q, in: () => q, order: () => q, limit: () => q,
      eq: (key, value) => { if (key === 'status' && value === 'open') onlyOpen = true; return q; },
      or: () => q,
      maybeSingle: async () => ({ data: table === 'fantasy_dino_settings' ? { selection_window_enabled: enabled } : (onlyOpen ? rounds.find(r => r.status === 'open' && Date.parse(r.deadline_at) > Date.now()) : rounds[0]) || null, error: null }),
    };
    return q;
  },
  rpc: async (name, args) => {
    assert.equal(name, 'dino_coach_transfer_window_open');
    assert.equal(args.target_season_id, 'season');
    return { data: windowOpen, error: rpcError };
  },
};
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    throw Error('Unexpected import: ' + name);
  }, exports);
  return exports;
}
const game = load('lib/fantasy-game.ts', { '@/lib/supabase-server': { createServerClient: () => db } });
(async () => {
  assert.equal((await game.getRoundLockState('season')).locked, true, 'Weekly closure must lock first squads as well as transfers');
  windowOpen = true;
  rounds = [expired, next];
  assert.equal((await game.getRoundLockState('season')).roundId, 'next', 'A scored round must not block the next open round');
  assert.equal((await game.getRoundLockState('season')).locked, false);
  rounds = [];
  assert.equal((await game.getRoundLockState('season')).locked, true, 'No open round must stay locked');
  rounds = [next];
  rpcError = { message: 'test unavailable' };
  await assert.rejects(game.getRoundLockState('season'));
  enabled = false;
  windowOpen = false;
  assert.equal((await game.getRoundLockState('season')).locked, false, 'Flag off preserves legacy behaviour');
  const domain = load('lib/dino-coach/domain.ts');
  const cfg = { timezone: 'Australia/Melbourne', openWeekday: 2, openMinute: 0, closeWeekday: 6, closeMinute: 660 };
  for (const [time, expected] of [
    ['2026-09-28T13:59:59Z', false], ['2026-09-28T14:00:00Z', true],
    ['2026-10-03T00:59:59Z', true], ['2026-10-03T01:00:00Z', false],
    ['2026-10-05T12:59:59Z', false], ['2026-10-05T13:00:00Z', true],
    ['2026-10-09T23:59:59Z', true], ['2026-10-10T00:00:00Z', false],
  ]) assert.equal(domain.isTransferWindowOpen(new Date(time), cfg), expected, time);
  console.log('PASS selection window: first squads, round rollover, missing rounds, fail-closed reads, flag off, AEST/AEDT boundaries');
})().catch(e => { console.error(e); process.exitCode = 1; });
