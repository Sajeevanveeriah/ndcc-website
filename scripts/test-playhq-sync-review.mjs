#!/usr/bin/env node
// Offline behavioural regression tests for the PlayHQ -> Dino Coach automatic
// results import (lib/playhq/fantasy-sync.ts, lib/playhq/orchestrator/*,
// lib/playhq/fantasy-orchestrator.ts, app/api/admin/fantasy/sync/route.ts).
// The real modules run against an in-memory Supabase stand-in; no network,
// secrets or database.
//   1. unchanged rows stranded in draft/rejected batches move into the
//      current batch; published rows are never moved,
//   2. review items no longer block automation or the publication of clean
//      rows; admins can dismiss items or approve a reconciliation (audited),
//   4. NDCC-named teams pass both the fixture and the summary filter; an
//      invalid team_filter is reported instead of aborting the job,
//   5. ambiguous_players counts the identity review types the sync raises,
//   6. only active seasons sync; the unreachable historical branch is gone,
//   7. UTC fixture start times map to the Melbourne match date.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, {
    exports,
    require: (name) => { if (!(name in imports)) throw Error(`unexpected import ${name} in ${path}`); return imports[name]; },
    console, process, setTimeout, clearTimeout, Date, Map, Set, Promise, JSON, Math, Number, String, Array, Object, RegExp, Error,
  });
  return exports;
}

// ---- In-memory Supabase stand-in -------------------------------------------
function createDb(tables) {
  let seq = 0;
  const rel = {
    fantasy_import_batches: (row) => (row.import_batch_id ? tables.fantasy_import_batches.find((b) => b.id === row.import_batch_id) ?? null : null),
    fantasy_rounds: (row) => (row.round_id ? (tables.fantasy_rounds ?? []).find((r) => r.id === row.round_id) ?? null : null),
  };
  const get = (row, col) => {
    if (!col.includes('.')) return row[col];
    const [name, field] = col.split('.');
    const joined = rel[name]?.(row);
    return joined ? joined[field] : undefined;
  };
  const withJoins = (table, row) => {
    const copy = { ...row };
    if (table === 'fantasy_match_stats') {
      const batch = rel.fantasy_import_batches(row);
      copy.fantasy_import_batches = batch ? { status: batch.status, source: batch.source } : null;
      const round = rel.fantasy_rounds(row);
      copy.fantasy_rounds = round ? { status: round.status, round_number: round.round_number } : null;
    }
    return copy;
  };
  const orFilter = (expression) => {
    const tests = expression.split(',').map((part) => {
      const [col, op, value] = part.split('.');
      if (op === 'lt') return (row) => Number(row[col]) < Number(value);
      if (op === 'is') return (row) => row[col] === null || row[col] === undefined;
      return () => false;
    });
    return (row) => tests.some((fn) => fn(row));
  };
  return {
    tables,
    rpc: async () => ({ data: true, error: null }),
    from(table) {
      const rows = () => (tables[table] ??= []);
      const state = { op: 'select', filters: [], count: null, limit: null, payload: null, onConflict: null };
      const matches = (row) => state.filters.every((fn) => fn(row));
      const exec = () => {
        if (state.op === 'insert') {
          const items = (Array.isArray(state.payload) ? state.payload : [state.payload]).map((item) => ({ id: item.id ?? `${table}-${++seq}`, ...item }));
          rows().push(...items);
          return { data: items, error: null };
        }
        if (state.op === 'upsert') {
          const items = Array.isArray(state.payload) ? state.payload : [state.payload];
          for (const item of items) {
            const keys = state.onConflict ? state.onConflict.split(',') : [];
            const existing = keys.length ? rows().find((row) => keys.every((key) => row[key] === item[key])) : null;
            if (existing) Object.assign(existing, item); else rows().push({ id: `${table}-${++seq}`, ...item });
          }
          return { data: items, error: null };
        }
        if (state.op === 'update') {
          const hit = rows().filter(matches);
          hit.forEach((row) => Object.assign(row, state.payload));
          return { data: hit.map((row) => withJoins(table, row)), error: null };
        }
        let hit = rows().filter(matches).map((row) => withJoins(table, row));
        if (state.limit !== null) hit = hit.slice(0, state.limit);
        if (state.count) return { data: null, count: hit.length, error: null };
        return { data: hit, error: null };
      };
      const first = () => { const result = exec(); return { data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: result.error }; };
      const q = {
        select(_cols, options) { if (state.op === 'select') state.count = options?.count ?? null; return q; },
        insert(payload) { state.op = 'insert'; state.payload = payload; return q; },
        update(payload) { state.op = 'update'; state.payload = payload; return q; },
        upsert(payload, options) { state.op = 'upsert'; state.payload = payload; state.onConflict = options?.onConflict ?? null; return q; },
        eq(col, value) { state.filters.push((row) => get(row, col) === value); return q; },
        neq(col, value) { state.filters.push((row) => get(row, col) !== value); return q; },
        in(col, values) { state.filters.push((row) => values.includes(get(row, col))); return q; },
        is(col, value) { state.filters.push((row) => (get(row, col) ?? null) === value); return q; },
        or(expression) { state.filters.push(orFilter(expression)); return q; },
        not() { return q; },
        order() { return q; },
        limit(n) { state.limit = n; return q; },
        maybeSingle: async () => first(),
        single: async () => { const result = first(); return result.data ? result : { data: null, error: { message: 'no rows', code: 'PGRST116' } }; },
        then(resolve, reject) { return Promise.resolve(exec()).then(resolve, reject); },
      };
      return q;
    },
  };
}

// ---- Modules under test ------------------------------------------------------
const importer = load('lib/playhq/fantasy-import.ts', { 'node:crypto': crypto });
const normalise = load('lib/playhq/normalise.ts');
const seasonMatch = load('lib/playhq/season-match.ts');
const shared = load('lib/playhq/orchestrator/shared.ts', { 'server-only': {} });
let db = createDb({});
let gameSummaries = {};
let gradeFixtures = [];
const domain = {
  classifyRoundKind: () => ({ roundKind: 'regular', pricingEligible: true }),
  fantasyWeekFromMatchDate: () => 1,
  resolveExactIdentityCandidate: () => ({ status: 'unmatched', playerId: null }),
};
const sync = load('lib/playhq/fantasy-sync.ts', {
  'server-only': {}, '@/lib/supabase-server': { createServerClient: () => db }, '@/lib/dino-coach/domain': domain,
  './client': {
    getPlayHQGameSummary: async (gameId) => gameSummaries[gameId],
    getPlayHQGradeFixtureRaw: async () => ({ data: gradeFixtures }),
    getPlayHQTeamFixtureRaw: async () => ({ data: [] }),
    getPlayHQTeams: async () => [],
  },
  './season-match': seasonMatch, './normalise': normalise, './fantasy-import': importer,
});
const publish = load('lib/playhq/orchestrator/publish.ts', { 'server-only': {}, 'next/cache': { revalidatePath: () => {} }, './shared': shared });

let passed = 0;
const test = async (label, fn) => { await fn(); passed += 1; console.log(`PASS ${label}`); };
const season = { id: 'S', name: 'Dino Coach 2026/2027', slug: '2026-27', status: 'active', is_current: true, is_public: true, auto_sync_enabled: true, playhq_season_id: 'phq-season', start_date: '2026-10-01' };

// ---- 1 + 4: stat rows, batches and the summary club filter ----------------
const summary = {
  data: {
    teams: [
      {
        name: 'NDCC 1st XI',
        players: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key, index) => ({
          playerId: `phq-${key}`, firstName: 'Player', lastName: key.toUpperCase(),
          statistics: { batting: { runsScored: 10 + index, ballsFaced: 20, dismissal: 'b Bowler' } },
        })),
      },
      { name: 'Leopold', players: [{ playerId: 'phq-z', firstName: 'Opp', lastName: 'Onent', statistics: { batting: { runsScored: 50 } } }] },
    ],
  },
};
const parsed = new Map(importer.normaliseGameSummaryPlayers(summary).map((line) => [line.playhq_player_id, line]));
const hashFor = (key) => importer.computeSourceHash({ gameId: 'g1', line: parsed.get(`phq-${key}`) });
let raceReads = 0;
const raceBatch = { id: 'B_race', source: 'playhq-api', get status() { raceReads += 1; return raceReads === 1 ? 'draft' : 'published'; } };
const stat = (key, batch, hash = hashFor(key), extra = {}) => ({
  id: `stat-${key}`, season_id: 'S', import_batch_id: batch, round_id: 'R1', player_id: `p-${key}`, playhq_game_id: 'g1', source_hash: hash,
  runs: parsed.get(`phq-${key}`).runs, wickets: 0, maidens: 0, catches: 0, runouts: 0, stumpings: 0, ducks: 0, not_out: false, player_of_match: false, ...extra,
});
const queueEntry = { gameId: 'g1', gradeId: 'grade', gradeName: 'GCA 1st XI', roundNumber: 1, roundName: 'Round 1', matchDate: '2026-10-10', homeTeam: 'NDCC 1st XI', awayTeam: 'Leopold' };

function freshSyncDb() {
  raceReads = 0;
  gameSummaries = { g1: summary };
  return createDb({
    fantasy_seasons: [{ ...season }],
    fantasy_import_batches: [
      { id: 'B_pub', status: 'published', source: 'playhq-api' },
      { id: 'B_old', status: 'draft', source: 'playhq-api' },
      { id: 'B_rej', status: 'rejected', source: 'playhq-api' },
      { id: 'B_cur', status: 'draft', source: 'playhq-api' },
      raceBatch,
    ],
    fantasy_players: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'z'].map((key) => ({ id: `p-${key}`, playhq_player_id: `phq-${key}`, display_name: `Player ${key}`, active: true })),
    fantasy_rounds: [{ id: 'R1', season_id: 'S', round_number: 1, status: 'scored' }],
    fantasy_season_players: [],
    fantasy_match_stats: [
      stat('a', 'B_pub'),
      stat('b', 'B_old'),
      stat('c', 'B_rej'),
      stat('d', 'B_pub', 'stale-hash', { runs: 99 }),
      stat('e', 'B_cur'),
      stat('f', 'B_race'),
    ],
    fantasy_sync_jobs: [{ id: 'J', season_id: 'S', import_batch_id: 'B_cur', status: 'pending', total_games: 1, processed_games: 0, successful_games: 0, failed_games: 0, cursor: { next: 0 }, game_queue: [queueEntry], counts: {}, review_items: [], error_summary: [] }],
  });
}
const statRow = (key) => db.tables.fantasy_match_stats.find((row) => row.id === `stat-${key}` || (row.player_id === `p-${key}` && row.playhq_game_id === 'g1'));

await test('1: unchanged rows in draft/rejected batches move into the current batch; published rows stay', async () => {
  db = freshSyncDb();
  const result = await sync.processFantasySyncBatch('J');
  assert.equal(result.done, true);
  assert.equal(statRow('a').import_batch_id, 'B_pub', 'published row is never moved');
  assert.equal(statRow('b').import_batch_id, 'B_cur', 'draft-batch row adopted');
  assert.equal(statRow('c').import_batch_id, 'B_cur', 'rejected-batch row adopted');
  assert.equal(statRow('e').import_batch_id, 'B_cur', 'row already in this batch stays');
  assert.equal(statRow('f').import_batch_id, 'B_race', 'row whose batch was published after the read is not moved');
  assert.equal(statRow('g').import_batch_id, 'B_cur', 'new row inserted into current batch');
  const job = db.tables.fantasy_sync_jobs[0];
  assert.equal(job.counts.adopted, 2);
  assert.equal(job.counts.skipped, 3);
});

await test('4: NDCC-named summary lines pass the club filter; opponents never import', async () => {
  assert.ok(statRow('g'), 'NDCC 1st XI lines were imported (old /newcomb/i filter quarantined them)');
  assert.equal(statRow('g').opponent, 'Leopold');
  assert.equal(db.tables.fantasy_match_stats.some((row) => row.player_id === 'p-z'), false);
  assert.equal(db.tables.fantasy_sync_jobs[0].review_items.some((item) => item.type === 'club_identity_missing'), false);
});

await test('2: changed published row raises an accurate reconciliation item with proposed figures', async () => {
  assert.equal(statRow('d').runs, 99, 'published stat untouched');
  assert.equal(statRow('d').import_batch_id, 'B_pub');
  const job = db.tables.fantasy_sync_jobs[0];
  assert.equal(job.status, 'needs_review');
  const item = job.review_items.find((entry) => entry.type === 'reconciliation');
  assert.equal(item.statId, 'stat-d');
  assert.equal(item.previousHash, 'stale-hash');
  assert.equal(item.sourceHash, hashFor('d'));
  assert.equal(item.proposed.runs, 13);
  assert.match(item.detail, /runs 99 -> 13/);
  assert.match(item.detail, /was not changed/);
});

await test('2: needs_review job with only non-blocking items publishes its clean rows', async () => {
  const job = db.tables.fantasy_sync_jobs[0];
  const log = await publish.validateAndPublish(db, season, job);
  assert.equal(log.status, 'ok', JSON.stringify(log));
  assert.equal(log.detail.published, true);
  assert.equal(log.detail.open_review_items, 1);
  assert.equal(db.tables.fantasy_import_batches.find((b) => b.id === 'B_cur').status, 'published');
  assert.equal(db.tables.fantasy_sync_jobs[0].review_items.length, 1, 'review item stays listed');
});

await test('2: failed games and empty_queue items still block publication', async () => {
  db = freshSyncDb();
  await sync.processFantasySyncBatch('J');
  const job = db.tables.fantasy_sync_jobs[0];
  for (const blocked of [{ ...job, failed_games: 1 }, { ...job, review_items: [{ type: 'empty_queue', detail: 'x' }] }]) {
    const log = await publish.validateAndPublish(db, season, blocked);
    assert.equal(log.status, 'blocked');
    assert.equal(db.tables.fantasy_import_batches.find((b) => b.id === 'B_cur').status, 'draft');
  }
});

await test('2: approving a reconciliation updates only that published row and completes the job', async () => {
  db = freshSyncDb();
  await sync.processFantasySyncBatch('J');
  const result = await sync.approveReconciliationItem('J', 'stat-d', { email: 'admin@example.test' });
  assert.equal(statRow('d').runs, 13);
  assert.equal(statRow('d').source_hash, hashFor('d'));
  assert.equal(statRow('d').import_batch_id, 'B_pub');
  assert.equal(statRow('d').round_id, 'R1');
  assert.deepEqual([result.before.runs, result.after.runs], [99, 13]);
  assert.equal(result.rescoreRequired, true, 'round already scored');
  const job = db.tables.fantasy_sync_jobs[0];
  assert.equal(job.review_items.length, 0);
  assert.equal(job.status, 'completed');
  assert.equal(job.counts.approved_reconciliations[0].statId, 'stat-d');
  // The next sync now skips the row (hash matches) instead of re-raising it.
  db.tables.fantasy_sync_jobs.push({ ...db.tables.fantasy_sync_jobs[0], id: 'J2', status: 'pending', cursor: { next: 0 }, counts: {}, review_items: [], import_batch_id: 'B_old' });
  await sync.processFantasySyncBatch('J2');
  assert.equal(db.tables.fantasy_sync_jobs[1].review_items.some((item) => item.type === 'reconciliation'), false);
});

await test('2: stale or old-format reconciliation approvals are refused without changes', async () => {
  db = freshSyncDb();
  await sync.processFantasySyncBatch('J');
  const item = db.tables.fantasy_sync_jobs[0].review_items.find((entry) => entry.type === 'reconciliation');
  statRow('d').source_hash = 'changed-elsewhere';
  await assert.rejects(sync.approveReconciliationItem('J', 'stat-d', {}), (error) => error.status === 409);
  assert.equal(statRow('d').runs, 99);
  statRow('d').source_hash = 'stale-hash';
  delete item.proposed;
  await assert.rejects(sync.approveReconciliationItem('J', 'stat-d', {}), (error) => error.status === 409);
  await assert.rejects(sync.approveReconciliationItem('J', 'stat-missing', {}), (error) => error.status === 404);
  assert.equal(statRow('d').runs, 99);
});

await test('2: dismissing review items completes a needs_review job only', async () => {
  db = freshSyncDb();
  await sync.processFantasySyncBatch('J');
  const result = await sync.resolveJobReviewItems('J', { email: 'admin@example.test' });
  assert.equal(result.dismissed, 1);
  const job = db.tables.fantasy_sync_jobs[0];
  assert.deepEqual([job.status, job.review_items.length, job.counts.dismissed_review_items.length, job.counts.reviews_resolved_by], ['completed', 0, 1, 'admin@example.test']);
  assert.equal(statRow('d').runs, 99, 'dismiss never changes published stats');
  await assert.rejects(sync.resolveJobReviewItems('J', {}), (error) => error.status === 409);
  db.tables.fantasy_sync_jobs[0].status = 'needs_review';
  db.tables.fantasy_sync_jobs[0].failed_games = 2;
  await assert.rejects(sync.resolveJobReviewItems('J', {}), (error) => error.status === 409);
});

await test('2: admin route actions sit behind the fantasy.seasons permission and are audited', async () => {
  const audits = [];
  let permission = null;
  const route = load('app/api/admin/fantasy/sync/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/auth/guard': { requirePermission: async (key) => { assert.equal(key, 'fantasy.seasons'); return permission; } },
    '@/lib/supabase-server': { createServerClient: () => db },
    '@/lib/playhq/fantasy-sync': sync,
    '@/lib/playhq/fantasy-orchestrator': {},
    '@/lib/server/revalidate-public': { revalidateDinoPublicCache: () => {} },
    '@/lib/revisions/server': { scheduleAdminAudit: (entry) => audits.push(entry) },
  });
  const post = (body) => route.POST({ json: async () => body });
  db = freshSyncDb();
  await sync.processFantasySyncBatch('J');
  assert.equal((await post({ action: 'resolve_reviews', jobId: 'J' })).status, 403);
  assert.equal((await post({ action: 'approve_reconciliation', jobId: 'J', statId: 'stat-d' })).status, 403);
  assert.equal(db.tables.fantasy_sync_jobs[0].status, 'needs_review');
  permission = { id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.test' };
  const approved = await post({ action: 'approve_reconciliation', jobId: 'J', statId: 'stat-d' });
  assert.equal(approved.status, 200);
  assert.equal(audits[0].resource, 'fantasy_match_stats');
  assert.equal(audits[0].recordId, 'stat-d');
  assert.match(audits[0].summary, /runs 99 -> 13/);
  const conflict = await post({ action: 'resolve_reviews', jobId: 'J' });
  assert.equal(conflict.status, 409, 'job already completed by the approval');
  assert.equal((await post({ action: 'resolve_reviews' })).status, 400);
});

// ---- 4 + 7: queue building ---------------------------------------------------
await test('4 + 7: fixture filter accepts NDCC teams, invalid team_filter is reported, UTC starts map to Melbourne dates', async () => {
  const fixture = (id, home, startTime) => ({ id, status: 'FINAL', startTime, round: { number: 1, name: 'Round 1' }, competitors: [{ isHomeTeam: true, name: home }, { isHomeTeam: false, name: 'Leopold' }] });
  for (const teamFilter of [null, 'newcomb', 'newcomb(']) {
    db = createDb({
      fantasy_seasons: [{ ...season }],
      fantasy_season_grade_sources: [{ season_id: 'S', enabled: true, playhq_grade_id: 'grade', grade_name: 'GCA 1st XI', team_filter: teamFilter, playhq_season_id: null }],
    });
    gradeFixtures = [fixture('g-ndcc', 'NDCC 1st XI', '2026-10-09T22:30:00Z'), fixture('g-other', 'Geelong', '2026-10-10T00:00:00Z')];
    const preview = await sync.startFantasySyncJob({ seasonId: 'S', dryRun: true });
    assert.equal(preview.queued, 1, String(teamFilter));
    assert.equal(preview.queuePreview[0].gameId, 'g-ndcc');
    assert.equal(preview.queuePreview[0].matchDate, '2026-10-10', 'Saturday AEDT, not Friday UTC');
    assert.equal(preview.reviewItems.some((item) => item.type === 'invalid_team_filter'), teamFilter === 'newcomb(');
  }
});

// ---- 2a + 5 + 6: orchestrator ------------------------------------------------
function loadAdvance(onProcess) {
  return load('lib/playhq/orchestrator/advance.ts', {
    'server-only': {}, '../fantasy-import': importer, './shared': shared, './discovery': {},
    '../fantasy-sync': {
      PLAYER_IDENTITY_REVIEW_TYPES: sync.PLAYER_IDENTITY_REVIEW_TYPES,
      startFantasySyncJob: async ({ seasonId }) => {
        const job = { id: `job-${db.tables.fantasy_sync_jobs.length + 1}`, season_id: seasonId, status: 'pending', total_games: 1, processed_games: 0, failed_games: 0, counts: {}, review_items: [], created_at: new Date().toISOString() };
        db.tables.fantasy_sync_jobs.push(job);
        return { job, rawEntries: 1, queued: 1, reviewItems: [], skippedGrades: [], gradeDebug: [], emptyQueueInvariantBreached: false, awaitingResults: 0 };
      },
      processFantasySyncBatch: async (jobId) => {
        const job = db.tables.fantasy_sync_jobs.find((row) => row.id === jobId);
        onProcess(job);
        return { job, done: true, processed: 1 };
      },
    },
    './publish': { validateAndPublish: async () => ({ seasonSlug: '2026-27', stage: 'publish_batch', status: 'ok' }) },
  });
}
const finishedJob = (hoursAgo, extra = {}) => ({ id: 'old', season_id: 'S', status: 'needs_review', total_games: 2, processed_games: 2, failed_games: 0, review_items: [{ type: 'unmatched_player', detail: 'x' }], counts: {}, completed_at: new Date(Date.now() - hoursAgo * 3600_000).toISOString(), ...extra });
const orchestratorDb = (jobs, extra = {}) => createDb({
  fantasy_season_grade_sources: [{ id: 'gs', season_id: 'S', enabled: true }],
  fantasy_sync_jobs: jobs, fantasy_sync_health: [], fantasy_seasons: [{ ...season }], fantasy_match_stats: [], fantasy_import_batches: [], ...extra,
});

await test('2a + 5: a previous needs_review job no longer blocks; ambiguous_players counts real review types', async () => {
  db = orchestratorDb([finishedJob(13)]);
  const advance = loadAdvance((job) => Object.assign(job, { status: 'needs_review', processed_games: 1, review_items: [
    { type: 'unmatched_player', detail: 'a' }, { type: 'ambiguous_exact_name', detail: 'b' }, { type: 'duplicate_source_link', detail: 'c' }, { type: 'reconciliation', detail: 'd' },
  ] }));
  const logs = await advance.advanceSeason(db, 'cron', { ...season }, Date.now() + 60_000, 10);
  assert.equal(logs.some((log) => log.status === 'blocked'), false, JSON.stringify(logs));
  assert.ok(logs.some((log) => log.stage === 'create_job' && log.status === 'ok'));
  assert.ok(logs.some((log) => log.stage === 'publish_batch'));
  assert.equal(db.tables.fantasy_sync_health[0].ambiguous_players, 3);
});

await test('2a: the 12-hour re-sync throttle still applies after a needs_review job', async () => {
  db = orchestratorDb([finishedJob(1)]);
  const logs = await loadAdvance(() => {}).advanceSeason(db, 'cron', { ...season }, Date.now() + 60_000, 10);
  assert.ok(logs.some((log) => log.stage === 'create_job' && log.status === 'skipped' && /12 hours/.test(log.detail.reason)), JSON.stringify(logs));
  assert.equal(db.tables.fantasy_sync_jobs.length, 1);
});

await test('6: a non-current active season follows the same 12-hour cadence (no dead historical branch)', async () => {
  const other = { ...season, is_current: false };
  db = orchestratorDb([finishedJob(1, { status: 'completed', review_items: [] })]);
  let logs = await loadAdvance(() => {}).advanceSeason(db, 'cron', other, Date.now() + 60_000, 10);
  assert.ok(logs.some((log) => log.stage === 'create_job' && log.status === 'skipped' && /12 hours/.test(log.detail.reason)), JSON.stringify(logs));
  db = orchestratorDb([finishedJob(13, { status: 'completed', review_items: [] })]);
  logs = await loadAdvance((job) => Object.assign(job, { status: 'completed' })).advanceSeason(db, 'cron', other, Date.now() + 60_000, 10);
  assert.ok(logs.some((log) => log.stage === 'create_job' && log.status === 'ok'), JSON.stringify(logs));
  assert.equal(readFileSync('lib/playhq/orchestrator/advance.ts', 'utf8').includes('Historical season already has published'), false);
});

await test('6: the orchestrator selects active auto-sync seasons only (completed seasons are reference data)', async () => {
  const seen = [];
  db = createDb({ fantasy_seasons: [
    { id: '1', slug: 'active', status: 'active', is_current: true, auto_sync_enabled: true },
    { id: '2', slug: 'completed', status: 'completed', is_current: false, auto_sync_enabled: true },
    { id: '3', slug: 'archived', status: 'archived', is_current: false, auto_sync_enabled: true },
    { id: '4', slug: 'manual', status: 'active', is_current: false, auto_sync_enabled: false },
  ], fantasy_sync_runs: [] });
  const orchestrator = load('lib/playhq/fantasy-orchestrator.ts', {
    'server-only': {}, '@/lib/supabase-server': { createServerClient: () => db }, './config': { getPlayHQConfig: () => ({ configured: true, missing: [] }) },
    './fantasy-sync': { DEFAULT_SYNC_BATCH_SIZE: 10 }, './orchestrator/shared': shared, './orchestrator/alerts': { maybeAlertAdmins: async () => {} },
    './orchestrator/advance': { advanceSeason: async (_db, _by, row) => { seen.push(row.slug); return []; } }, './orchestrator/health': {},
  });
  const result = await orchestrator.runFantasyOrchestrator({ invokedBy: 'test' });
  assert.equal(result.ran, true);
  assert.deepEqual(seen, ['active']);
});

console.log(`PlayHQ sync review, publication and orchestrator checks passed (${passed}).`);
