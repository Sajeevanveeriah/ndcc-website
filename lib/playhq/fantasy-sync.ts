/* eslint-disable @typescript-eslint/no-explicit-any */
// PlayHQ -> Fantasy resumable sync orchestration.
//
// Flow: enabled season grades -> raw fixtures -> completed NDCC games queued on
// a fantasy_sync_jobs row -> bounded batches of game summaries -> player
// identity resolution (PlayHQ player id primary; name clashes go to review) ->
// exact round mapping (ambiguous rounds go to review) -> idempotent stat
// upserts into a draft import batch that admins review and publish.
import 'server-only';
import { createServerClient } from '@/lib/supabase-server';
import { classifyRoundKind, fantasyWeekFromMatchDate, resolveExactIdentityCandidate } from '@/lib/dino-coach/domain';
import { getPlayHQGameSummary, getPlayHQGradeFixtureRaw, getPlayHQTeamFixtureRaw, getPlayHQTeams } from './client';
import { isClubTeamName } from './season-match';
import { normaliseFixtures } from './normalise';
import {
  computeSourceHash,
  extractRoundInfo,
  involvesClubTeam,
  isCompletedFixture,
  normaliseGameSummaryPlayers,
  type PlayHQPlayerStatLine,
} from './fantasy-import';

export const DEFAULT_SYNC_BATCH_SIZE = 10;

type QueueEntry = {
  gameId: string;
  gradeId: string;
  gradeName: string;
  roundNumber: number | null;
  roundName: string | null;
  matchDate: string | null;
  homeTeam: string;
  awayTeam: string;
  processed?: boolean;
};

type ReviewItem = { type: string; gameId?: string; playerId?: string; detail: string };

function firstArray(payload: unknown): unknown[] {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  for (const key of ['data', 'items', 'fixtures', 'games']) if (Array.isArray(root[key])) return root[key] as unknown[];
  const data = (root.data && typeof root.data === 'object' ? root.data : {}) as Record<string, unknown>;
  for (const key of ['items', 'fixtures', 'games']) if (Array.isArray(data[key])) return data[key] as unknown[];
  return Array.isArray(payload) ? payload : [];
}

async function withRetries<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : '';
      const retryable = /HTTP (429|5\d\d)/.test(message) || /aborted|network|fetch failed/i.test(message);
      if (!retryable || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

// dryRun: perform discovery + queue building and report what WOULD be
// imported, without creating any batch/job rows (the CMS "Run Preview").
export async function startFantasySyncJob(options: { seasonId: string; createdBy?: string | null; dryRun?: boolean }) {
  const supabase = createServerClient();
  const { data: season, error: seasonError } = await supabase
    .from('fantasy_seasons')
    .select('id, name, slug, playhq_season_id')
    .eq('id', options.seasonId)
    .maybeSingle();
  if (seasonError) throw new Error(seasonError.message);
  if (!season) throw new Error('Fantasy season not found.');
  if (!season.playhq_season_id) throw new Error('This fantasy season is not linked to a PlayHQ season yet.');

  const { data: grades, error: gradeError } = await supabase
    .from('fantasy_season_grade_sources')
    .select('playhq_grade_id, grade_name, team_filter, playhq_season_id')
    .eq('season_id', season.id)
    .eq('enabled', true);
  if (gradeError) throw new Error(gradeError.message);
  if (!grades?.length) throw new Error('Enable at least one PlayHQ grade source for this season before importing.');

  // Club team ids per grade, for the per-team fixture fallback: the season
  // teams endpoint is the one feed PlayHQ reliably serves for club
  // organisations, and it carries each team's grade id.
  const sourceSeasonIds = Array.from(new Set(
    grades.map((grade: { playhq_season_id: string | null }) => grade.playhq_season_id || season.playhq_season_id).filter(Boolean)
  )) as string[];
  const clubTeamsByGrade = new Map<string, Array<{ id: string; name: string }>>();
  for (const sourceSeasonId of sourceSeasonIds.slice(0, 8)) {
    const teams = await getPlayHQTeams(sourceSeasonId).catch(() => []);
    for (const team of teams) {
      if (!team.gradeId || !isClubTeamName(team.name)) continue;
      const entry = clubTeamsByGrade.get(team.gradeId) ?? [];
      entry.push({ id: team.id, name: team.name });
      clubTeamsByGrade.set(team.gradeId, entry);
    }
  }

  const queue: QueueEntry[] = [];
  const reviewItems: ReviewItem[] = [];
  // Grades whose fixture endpoint is unavailable (e.g. HTTP 404 - PlayHQ does
  // not serve fixture data for every discovered grade id). These are recorded
  // and skipped rather than aborting the whole job; only a total failure of
  // every grade stops the sync.
  const skippedGrades: Array<{ gradeId: string; gradeName: string; error: string }> = [];
  const seenGameIds = new Set<string>();
  // When a grade contributes zero queued games, capture what the API actually
  // returned (source path, entry count, truncated first entry) so the run log
  // itself is the diagnostic - no server access needed to see the payloads.
  const gradeDebug: Array<{ gradeId: string; gradeName: string; source: string; raw_entries: number; entry_keys?: string[]; sample: string | null }> = [];
  // Total raw source entries across all grades - the non-empty-sync
  // invariant compares this with the queue length: raw entries with zero
  // queued games is never a silent success.
  let rawEntriesTotal = 0;
  for (const grade of grades) {
    let rawFixtures: unknown[];
    let fixtureSource = 'grade-endpoint';
    try {
      const raw = await withRetries(() => getPlayHQGradeFixtureRaw(grade.playhq_grade_id));
      rawFixtures = firstArray(raw);
      if (!rawFixtures.length && raw && typeof raw === 'object') {
        gradeDebug.push({ gradeId: grade.playhq_grade_id, gradeName: grade.grade_name, source: fixtureSource, raw_entries: 0, sample: JSON.stringify(raw).slice(0, 400) });
      }
    } catch (gradeError) {
      // Grade-level fixture paths 404 for this organisation; fall back to the
      // per-team fixture feed for the NDCC teams in this grade.
      const clubTeams = clubTeamsByGrade.get(grade.playhq_grade_id) ?? [];
      const merged: unknown[] = [];
      let teamError: unknown = null;
      for (const team of clubTeams) {
        try {
          const teamRaw = await withRetries(() => getPlayHQTeamFixtureRaw(team.id));
          merged.push(...firstArray(teamRaw));
        } catch (error) {
          teamError = error;
        }
      }
      if (!merged.length) {
        const message = (teamError ?? gradeError) instanceof Error ? ((teamError ?? gradeError) as Error).message : 'fixture fetch failed';
        skippedGrades.push({ gradeId: grade.playhq_grade_id, gradeName: grade.grade_name, error: `${message}${clubTeams.length ? ` (grade + ${clubTeams.length} team feed(s))` : ' (no club teams found for team-feed fallback)'}` });
        continue;
      }
      rawFixtures = merged;
      fixtureSource = `team-feeds(${clubTeams.length})`;
    }
    rawEntriesTotal += rawFixtures.length;
    const fixtures = normaliseFixtures({ data: rawFixtures }, { id: grade.playhq_grade_id, name: grade.grade_name });
    const queuedBefore = queue.length;
    const clubPattern = grade.team_filter ? new RegExp(grade.team_filter, 'i') : undefined;
    fixtures.forEach((fixture, index) => {
      if (!isCompletedFixture(fixture) || !involvesClubTeam(fixture, clubPattern)) return;
      // Team-feed fallback can surface the same game twice (both NDCC sides
      // of a local derby); queue every game exactly once.
      if (seenGameIds.has(fixture.id)) return;
      seenGameIds.add(fixture.id);
      const round = extractRoundInfo(rawFixtures[index]);
      if (!round) {
        reviewItems.push({ type: 'ambiguous_round', gameId: fixture.id, detail: `Game ${fixture.id} (${fixture.homeTeam} v ${fixture.awayTeam}) has no exact PlayHQ round metadata; map it manually before it can be imported.` });
        return;
      }
      queue.push({
        gameId: fixture.id,
        gradeId: grade.playhq_grade_id,
        gradeName: grade.grade_name,
        roundNumber: round.number,
        roundName: round.name,
        matchDate: fixture.startsAt ? fixture.startsAt.slice(0, 10) : null,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
      });
    });
    if (queue.length === queuedBefore && rawFixtures.length) {
      const first = rawFixtures.find((entry) => entry && typeof entry === 'object') as Record<string, unknown> | undefined;
      gradeDebug.push({
        gradeId: grade.playhq_grade_id,
        gradeName: grade.grade_name,
        source: fixtureSource,
        raw_entries: rawFixtures.length,
        entry_keys: first ? Object.keys(first) : [],
        sample: JSON.stringify(rawFixtures[0]).slice(0, 400),
      });
    }
  }

  if (skippedGrades.length === grades.length) {
    throw new Error(`Every enabled grade's fixture endpoint failed: ${skippedGrades.map((grade) => `${grade.gradeName} (${grade.error})`).join('; ')}`);
  }

  // Deterministic ordering keeps re-created jobs stable and auditable.
  queue.sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0) || a.gameId.localeCompare(b.gameId));

  // NON-EMPTY SYNC INVARIANT: raw source entries with nothing queued is a
  // shape/filter mismatch, never a success. The job is created as
  // needs_review with the per-grade diagnostics (source path, entry keys,
  // truncated samples - no credentials) so an admin can see exactly what the
  // API returned. Zero raw entries stays a legitimate empty state (e.g. a
  // new season PlayHQ has not published yet).
  const emptyQueueInvariantBreached = !options.dryRun && queue.length === 0 && rawEntriesTotal > 0;
  if (emptyQueueInvariantBreached) {
    reviewItems.push({
      type: 'empty_queue',
      detail: `PlayHQ returned ${rawEntriesTotal} raw fixture entr${rawEntriesTotal === 1 ? 'y' : 'ies'} across ${grades.length} grade(s) but zero games were queued. `
        + 'Likely a payload-shape or club-filter mismatch - inspect the per-grade diagnostics on this job before trusting any "no games" result.',
    });
  }

  if (options.dryRun) {
    return {
      job: null,
      batchId: null,
      queued: queue.length,
      rawEntries: rawEntriesTotal,
      reviewItems,
      skippedGrades,
      gradeDebug,
      emptyQueueInvariantBreached: queue.length === 0 && rawEntriesTotal > 0,
      queuePreview: queue.slice(0, 25),
      dryRun: true as const,
    };
  }

  const { data: batch, error: batchError } = await supabase
    .from('fantasy_import_batches')
    .insert({
      source: 'playhq-api',
      status: 'draft',
      season_id: season.id,
      filename: null,
      notes: `PlayHQ sync for ${season.name} (${queue.length} completed club games queued${skippedGrades.length ? `; ${skippedGrades.length} grade(s) skipped: ${skippedGrades.map((grade) => grade.gradeName).join(', ')}` : ''}).`,
      source_url: 'playhq://cricket/game-summaries',
      fetched_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (batchError || !batch) throw new Error(batchError?.message || 'Could not create import batch.');

  const { data: job, error: jobError } = await supabase
    .from('fantasy_sync_jobs')
    .insert({
      season_id: season.id,
      import_batch_id: batch.id,
      // Invariant breach parks the job in needs_review immediately: it must
      // never drain an empty queue into a "completed" empty sync.
      status: emptyQueueInvariantBreached ? 'needs_review' : 'pending',
      total_games: queue.length,
      cursor: { next: 0 },
      game_queue: queue,
      counts: { created: 0, matched: 0, updated: 0, skipped: 0, warnings: reviewItems.length, failed: 0, raw_entries: rawEntriesTotal, skipped_grades: skippedGrades, grade_debug: gradeDebug.slice(0, 12) },
      review_items: reviewItems,
      created_by: options.createdBy ?? null,
      started_at: new Date().toISOString(),
      ...(emptyQueueInvariantBreached ? { completed_at: new Date().toISOString() } : {}),
    })
    .select('id, status, total_games')
    .single();
  if (jobError || !job) throw new Error(jobError?.message || 'Could not create sync job.');
  return {
    job,
    batchId: batch.id,
    queued: queue.length,
    rawEntries: rawEntriesTotal,
    reviewItems,
    skippedGrades,
    gradeDebug,
    emptyQueueInvariantBreached,
    dryRun: false as const,
  };
}

async function resolvePlayer(supabase: any, seasonId: string, line: PlayHQPlayerStatLine, gradeName: string, counts: Record<string, number>, reviewItems: ReviewItem[]) {
  const { data: byId } = await supabase.from('fantasy_players').select('id').eq('playhq_player_id', line.playhq_player_id).limit(1).maybeSingle();
  let playerId: string | null = byId?.id ?? null;

  if (!playerId) {
    const { data: roster, error: rosterError } = await supabase
      .from('fantasy_players')
      .select('id, display_name, playhq_player_id')
      .eq('active', true);
    if (rosterError) throw new Error(rosterError.message);
    const decision = resolveExactIdentityCandidate(line.display_name, (roster ?? []).map((candidate: any) => ({ id: candidate.id, displayName: candidate.display_name })));
    if (decision.status === 'ambiguous') {
      reviewItems.push({ type: 'ambiguous_exact_name', playerId: line.playhq_player_id, detail: `PlayHQ player ${line.display_name} (${line.playhq_player_id}) matches more than one NDCC roster identity. Manual review is required.` });
      return null;
    }
    if (decision.status === 'unmatched' || !decision.playerId) {
      reviewItems.push({ type: 'unmatched_player', playerId: line.playhq_player_id, detail: `PlayHQ player ${line.display_name} (${line.playhq_player_id}) has no unique exact NDCC roster match. No player was created automatically.` });
      return null;
    }
    const rosterPlayer = (roster ?? []).find((candidate: any) => candidate.id === decision.playerId);
    if (rosterPlayer?.playhq_player_id && rosterPlayer.playhq_player_id !== line.playhq_player_id) {
      reviewItems.push({ type: 'duplicate_source_link', playerId: line.playhq_player_id, detail: `NDCC player ${line.display_name} is already linked to a different PlayHQ player id. Manual review is required.` });
      return null;
    }
    const { error: linkError } = await supabase.from('fantasy_players').update({ playhq_player_id: line.playhq_player_id }).eq('id', decision.playerId).is('playhq_player_id', null);
    if (linkError) throw new Error(linkError.message);
    playerId = decision.playerId;
    const { error: auditError } = await supabase.from('fantasy_player_identity_audit').upsert({
      season_id: seasonId,
      player_id: playerId,
      playhq_player_id: line.playhq_player_id,
      playhq_display_name: line.display_name,
      local_display_name: rosterPlayer?.display_name ?? line.display_name,
      decision: 'unique_normalised_name',
      detail: `Unique exact normalised-name match in ${gradeName}.`,
    }, { onConflict: 'season_id,playhq_player_id,player_id,decision' });
    if (auditError) throw new Error(auditError.message);
    counts.matched += 1;
  } else {
    counts.matched += 1;
  }

  const membership = {
    season_id: seasonId,
    player_id: playerId,
    playhq_player_id: line.playhq_player_id,
    team_label: line.team_name || null,
    grade_label: gradeName || null,
    source: 'playhq-api',
    last_seen_at: new Date().toISOString(),
  };
  const { data: existingMembership } = await supabase.from('fantasy_season_players').select('id').eq('season_id', seasonId).eq('player_id', playerId).limit(1).maybeSingle();
  if (existingMembership) {
    await supabase.from('fantasy_season_players').update({ playhq_player_id: line.playhq_player_id, team_label: membership.team_label, grade_label: membership.grade_label, last_seen_at: membership.last_seen_at }).eq('id', existingMembership.id);
  } else {
    // New season player: UNASSIGNED and not selectable until an admin reviews.
    const { error: membershipError } = await supabase.from('fantasy_season_players').insert({ ...membership, role: 'UNASSIGNED', active: true, selectable: false, first_seen_at: membership.last_seen_at });
    if (membershipError) throw new Error(membershipError.message);
  }
  return playerId;
}

async function ensureRound(
  supabase: any,
  seasonId: string,
  seasonStartDate: string | null,
  gradeId: string,
  sourceRoundNumber: number,
  sourceRoundName: string,
  matchDate: string | null,
) {
  const fantasyWeek = matchDate && seasonStartDate
    ? fantasyWeekFromMatchDate(matchDate, seasonStartDate)
    : sourceRoundNumber;
  if (!fantasyWeek) throw new Error(`Could not map ${sourceRoundName} to a Dino Coach week.`);
  const roundContract = classifyRoundKind(sourceRoundName);
  const readRound = () => supabase
    .from('fantasy_rounds')
    .select('id')
    .eq('season_id', seasonId)
    .eq('round_number', fantasyWeek)
    .limit(1)
    .maybeSingle();

  const { data: existing } = await readRound();
  let roundId = existing?.id as string | undefined;
  if (!roundId) {
    const { data: created, error } = await supabase
      .from('fantasy_rounds')
      .insert({
        season_id: seasonId,
        round_number: fantasyWeek,
        name: roundContract.pricingEligible ? `Dino Coach Week ${fantasyWeek}` : sourceRoundName,
        status: 'draft',
        round_kind: roundContract.roundKind,
        pricing_eligible: roundContract.pricingEligible,
      })
      .select('id')
      .single();
    roundId = created?.id as string | undefined;
    if (error) {
      // Idempotency under races or stale reads: if the round already exists
      // (unique on season_id + round_number), adopt it instead of failing the
      // game import. Production evidence 2026-07-16: stale cached reads made
      // the pre-check miss rounds created seconds earlier, failing 10 games.
      if (error.code === '23505' || /duplicate key/i.test(error.message || '')) {
        const { data: after } = await readRound();
        if (after) roundId = after.id as string;
        else throw new Error(error.message || `Could not create Dino Coach week ${fantasyWeek}.`);
      } else {
        throw new Error(error.message || `Could not create Dino Coach week ${fantasyWeek}.`);
      }
    }
  }
  if (!roundId) throw new Error(`Could not resolve Dino Coach week ${fantasyWeek}.`);
  const { error: sourceError } = await supabase.from('fantasy_playhq_round_sources').upsert({
    season_id: seasonId,
    playhq_grade_id: gradeId,
    playhq_round_number: sourceRoundNumber,
    playhq_round_name: sourceRoundName,
    match_date: matchDate,
    fantasy_round_id: roundId,
    round_kind: roundContract.roundKind,
    pricing_eligible: roundContract.pricingEligible,
  }, { onConflict: 'season_id,playhq_grade_id,playhq_round_number,playhq_round_name' });
  if (sourceError) throw new Error(sourceError.message);
  return roundId;
}

export async function processFantasySyncBatch(jobId: string, batchSize = DEFAULT_SYNC_BATCH_SIZE) {
  const supabase = createServerClient();
  const { data: job, error: jobError } = await supabase.from('fantasy_sync_jobs').select('*').eq('id', jobId).maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job) throw new Error('Sync job not found.');
  if (['completed', 'cancelled', 'failed'].includes(job.status)) return { job, done: true, processed: 0 };

  const queue: QueueEntry[] = Array.isArray(job.game_queue) ? job.game_queue : [];
  const { data: season, error: seasonError } = await supabase
    .from('fantasy_seasons')
    .select('start_date')
    .eq('id', job.season_id)
    .maybeSingle();
  if (seasonError) throw new Error(seasonError.message);
  const counts = { created: 0, matched: 0, updated: 0, skipped: 0, warnings: 0, failed: 0, ...(job.counts || {}) };
  const reviewItems: ReviewItem[] = Array.isArray(job.review_items) ? job.review_items : [];
  const errors: Array<{ gameId: string; message: string }> = Array.isArray(job.error_summary) ? job.error_summary : [];
  let next = Number(job.cursor?.next ?? 0);
  let processedNow = 0;
  let successfulNow = 0;
  let failedNow = 0;

  await supabase.from('fantasy_sync_jobs').update({ status: 'running' }).eq('id', jobId);

  const limit = Math.max(1, Math.min(batchSize, 50));
  while (processedNow < limit && next < queue.length) {
    const entry = queue[next];
    next += 1;
    processedNow += 1;
    try {
      const summary = await withRetries(() => getPlayHQGameSummary(entry.gameId));
      const lines = normaliseGameSummaryPlayers(summary);
      const clubLines = lines.filter((line) => /newcomb/i.test(line.team_name || ''));
      if (lines.length > 0 && clubLines.length === 0) {
        reviewItems.push({ type: 'club_identity_missing', gameId: entry.gameId, detail: `Game ${entry.gameId} returned player statistics without an explicit Newcomb team identity. The game was quarantined to prevent opponent-player leakage.` });
        counts.warnings += 1;
        continue;
      }
      const roundId = await ensureRound(
        supabase,
        job.season_id,
        season?.start_date ?? null,
        entry.gradeId,
        entry.roundNumber as number,
        entry.roundName || `Round ${entry.roundNumber}`,
        entry.matchDate,
      );
      const opponent = /newcomb/i.test(entry.homeTeam) ? entry.awayTeam : entry.homeTeam;

      for (const line of clubLines) {
        const playerId = await resolvePlayer(supabase, job.season_id, line, entry.gradeName, counts, reviewItems);
        if (!playerId) { counts.warnings += 1; continue; }
        const sourceHash = computeSourceHash({ gameId: entry.gameId, line });
        const statRow = {
          season_id: job.season_id,
          import_batch_id: job.import_batch_id,
          round_id: roundId,
          player_id: playerId,
          match_date: entry.matchDate,
          opponent,
          runs: line.runs, wickets: line.wickets, maidens: line.maidens, catches: line.catches,
          runouts: line.runouts, stumpings: line.stumpings, ducks: line.ducks,
          not_out: line.not_out, player_of_match: line.player_of_match,
          playhq_game_id: entry.gameId,
          playhq_round_number: entry.roundNumber,
          playhq_round_name: entry.roundName,
          source_hash: sourceHash,
          source_updated_at: new Date().toISOString(),
        };
        const { data: existing } = await supabase
          .from('fantasy_match_stats')
          .select('id, source_hash, import_batch_id, fantasy_import_batches(status)')
          .eq('season_id', job.season_id)
          .eq('playhq_game_id', entry.gameId)
          .eq('player_id', playerId)
          .limit(1)
          .maybeSingle();
        if (!existing) {
          const { error: insertError } = await supabase.from('fantasy_match_stats').insert(statRow);
          if (insertError) throw new Error(insertError.message);
        } else if (existing.source_hash === sourceHash) {
          counts.skipped += 1;
        } else if ((existing as any).fantasy_import_batches?.status === 'published') {
          // Published rows never change silently; reconcile through review.
          counts.warnings += 1;
          reviewItems.push({ type: 'reconciliation', gameId: entry.gameId, playerId, detail: `PlayHQ changed the published summary for game ${entry.gameId} / player ${line.display_name}. Approve the reconciliation to update the published stat.` });
        } else {
          const { error: updateError } = await supabase.from('fantasy_match_stats').update(statRow).eq('id', existing.id);
          if (updateError) throw new Error(updateError.message);
          counts.updated += 1;
        }
      }
      successfulNow += 1;
    } catch (error) {
      failedNow += 1;
      counts.failed += 1;
      errors.push({ gameId: entry.gameId, message: error instanceof Error ? error.message : 'Unknown import error' });
    }
  }

  const done = next >= queue.length;
  const status = done ? (reviewItems.length || counts.failed ? 'needs_review' : 'completed') : 'paused';
  const update = {
    status,
    processed_games: next,
    successful_games: Number(job.successful_games || 0) + successfulNow,
    failed_games: Number(job.failed_games || 0) + failedNow,
    cursor: { next },
    counts,
    review_items: reviewItems,
    error_summary: errors,
    completed_at: done ? new Date().toISOString() : null,
  };
  const { data: updated, error: updateError } = await supabase.from('fantasy_sync_jobs').update(update).eq('id', jobId).select('id, status, total_games, processed_games, successful_games, failed_games, counts, review_items, error_summary').single();
  if (updateError) throw new Error(updateError.message);
  if (done) {
    await supabase.from('fantasy_seasons').update({ last_playhq_sync_at: new Date().toISOString() }).eq('id', job.season_id);
  }
  return { job: updated, done, processed: processedNow };
}

// Retry only the failed games of a job by re-queueing them behind the cursor.
export async function retryFailedGames(jobId: string) {
  const supabase = createServerClient();
  const { data: job, error } = await supabase.from('fantasy_sync_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new Error('Sync job not found.');
  const errors: Array<{ gameId: string }> = Array.isArray(job.error_summary) ? job.error_summary : [];
  if (!errors.length) return { job, requeued: 0 };
  const queue: QueueEntry[] = Array.isArray(job.game_queue) ? job.game_queue : [];
  const failedIds = new Set(errors.map((item) => item.gameId));
  const requeued = queue.filter((entry) => failedIds.has(entry.gameId));
  const newQueue = [...queue.filter((entry) => !failedIds.has(entry.gameId)), ...requeued];
  const counts = { ...(job.counts || {}) };
  counts.failed = 0;
  const { data: updated, error: updateError } = await supabase
    .from('fantasy_sync_jobs')
    .update({ status: 'paused', game_queue: newQueue, cursor: { next: Math.max(0, newQueue.length - requeued.length) }, error_summary: [], counts, failed_games: 0, completed_at: null })
    .eq('id', jobId)
    .select('id, status, total_games, processed_games')
    .single();
  if (updateError) throw new Error(updateError.message);
  return { job: updated, requeued: requeued.length };
}
