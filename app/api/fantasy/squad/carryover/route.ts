/* eslint-disable @typescript-eslint/no-explicit-any */
// Carry a prior-season squad into a new-season draft.
// GET  ?source=<slug|id>&target=<slug|id>  -> preview plan, no writes.
// POST { source, target }                  -> create/update the target-season
// draft squad (never the source), idempotently, with carried_from_squad_id.
import { NextResponse } from 'next/server';
import { resolveFantasyManagerAuth } from '@/lib/fantasy-manager-auth';
import { createServerClient } from '@/lib/supabase-server';
import { resolveSeason, seasonAllowsTeamChanges } from '@/lib/fantasy-seasons';
import { getActivePlayersWithLatestPrices, getFantasySettings, validateDraftSquadSelection } from '@/lib/fantasy-game';
import { buildCarryoverPlan, type SourceSquadPlayer } from '@/lib/fantasy-carryover';

export const dynamic = 'force-dynamic';

async function loadSourceSquad(managerId: string, seasonId: string) {
  const supabase = createServerClient();
  // Latest submitted/locked squad wins; fall back to the latest draft so a
  // manager who never formally submitted can still port their picks.
  for (const statuses of [['submitted', 'locked'], ['draft']]) {
    const { data, error } = await supabase
      .from('fantasy_squads')
      .select('id, status, round_id, fantasy_squad_players(player_id, position_type, bench_order, is_captain, is_vice_captain, fantasy_players(display_name, role))')
      .eq('manager_id', managerId)
      .eq('season_id', seasonId)
      .in('status', statuses)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;
  }
  return null;
}

async function buildPlan(request: Request, managerId: string, body?: any) {
  const url = new URL(request.url);
  const sourceSelector = String(body?.source ?? url.searchParams.get('source') ?? '').trim();
  const targetSelector = String(body?.target ?? url.searchParams.get('target') ?? '').trim();
  if (!sourceSelector || !targetSelector) return { error: 'source and target seasons are required.', status: 400 } as const;

  const [sourceSeason, targetSeason] = await Promise.all([resolveSeason(sourceSelector), resolveSeason(targetSelector)]);
  if (!sourceSeason || sourceSeason.slug !== sourceSelector && sourceSeason.id !== sourceSelector) return { error: 'Source season was not found.', status: 404 } as const;
  if (!targetSeason || targetSeason.slug !== targetSelector && targetSeason.id !== targetSelector) return { error: 'Target season was not found.', status: 404 } as const;
  if (sourceSeason.id === targetSeason.id) return { error: 'Source and target seasons must be different.', status: 400 } as const;
  if (!seasonAllowsTeamChanges(targetSeason)) return { error: 'Team building is not open for the target season.', status: 403 } as const;

  const sourceSquad = await loadSourceSquad(managerId, sourceSeason.id);
  if (!sourceSquad) return { error: 'No squad was found in the source season.', status: 404 } as const;

  // Source roles/prices come from the source season's pool so role and price
  // changes can be reported; missing price data degrades to 0 (change flagged).
  const [sourcePlayers, targetPlayers, targetSettings] = await Promise.all([
    getActivePlayersWithLatestPrices(sourceSeason.id).catch(() => []),
    getActivePlayersWithLatestPrices(targetSeason.id),
    getFantasySettings(targetSeason.id),
  ]);
  const sourceById = new Map(sourcePlayers.map((player) => [player.id, player]));

  const squadPlayers: SourceSquadPlayer[] = ((sourceSquad as any).fantasy_squad_players ?? []).map((item: any) => ({
    player_id: item.player_id,
    display_name: item.fantasy_players?.display_name || 'Unknown player',
    role: sourceById.get(item.player_id)?.role || item.fantasy_players?.role || 'UNASSIGNED',
    price_million: sourceById.get(item.player_id)?.price_million ?? 0,
    position_type: item.position_type === 'bench' ? 'bench' : 'starter',
    bench_order: item.bench_order,
    is_captain: item.is_captain === true,
    is_vice_captain: item.is_vice_captain === true,
  }));

  const plan = buildCarryoverPlan(squadPlayers, targetPlayers, targetSettings);
  return { plan, sourceSeason, targetSeason, sourceSquad, targetPlayers, targetSettings } as const;
}

export async function GET(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  try {
    const result = await buildPlan(request, auth.manager.id);
    if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    return NextResponse.json({
      success: true,
      sourceSeason: { id: result.sourceSeason.id, slug: result.sourceSeason.slug, name: result.sourceSeason.name },
      targetSeason: { id: result.targetSeason.id, slug: result.targetSeason.slug, name: result.targetSeason.name },
      plan: result.plan,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not build carryover preview.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { auth, errorMessage, errorStatus } = await resolveFantasyManagerAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: errorMessage }, { status: errorStatus });
  const body = await request.json().catch(() => ({}));
  try {
    const result = await buildPlan(request, auth.manager.id, body);
    if ('error' in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    const { plan, targetSeason, sourceSquad, targetPlayers, targetSettings } = result;
    if (!plan.selection.length) return NextResponse.json({ success: false, error: 'No source-squad players are available in the target season.', plan }, { status: 400 });

    const validation = validateDraftSquadSelection(plan.selection, targetPlayers, targetSettings);
    if (!validation.valid) return NextResponse.json({ success: false, error: validation.errors.join(' '), plan }, { status: 400 });

    const supabase = createServerClient();
    const { data: existing, error: existingError } = await supabase
      .from('fantasy_squads')
      .select('id, status')
      .eq('manager_id', auth.manager.id)
      .eq('season_id', targetSeason.id)
      .is('round_id', null)
      .limit(1)
      .maybeSingle();
    if (existingError) return NextResponse.json({ success: false, error: existingError.message }, { status: 500 });
    if (existing && existing.status !== 'draft') {
      return NextResponse.json({ success: false, error: 'You already have a submitted squad in the target season; carryover only writes drafts.' }, { status: 409 });
    }

    const squadValues = {
      manager_id: auth.manager.id,
      season_id: targetSeason.id,
      round_id: null,
      status: 'draft',
      budget_used: plan.budgetUsed,
      carried_from_squad_id: (sourceSquad as any).id,
    };
    const squadColumns = 'id, manager_id, season_id, status, budget_used, carried_from_squad_id';
    const squadResult = existing
      ? await supabase.from('fantasy_squads').update(squadValues).eq('id', existing.id).select(squadColumns).single()
      : await supabase.from('fantasy_squads').insert(squadValues).select(squadColumns).single();
    if (squadResult.error || !squadResult.data) return NextResponse.json({ success: false, error: squadResult.error?.message || 'Could not save draft squad.' }, { status: 500 });

    const squad = squadResult.data;
    const clear = await supabase.from('fantasy_squad_players').delete().eq('squad_id', squad.id);
    if (clear.error) return NextResponse.json({ success: false, error: clear.error.message }, { status: 500 });
    const rows = plan.selection.map((item) => ({
      squad_id: squad.id,
      player_id: item.playerId,
      position_type: item.positionType,
      bench_order: item.positionType === 'bench' ? item.benchOrder : null,
      is_captain: item.isCaptain,
      is_vice_captain: item.isViceCaptain,
    }));
    const insert = await supabase.from('fantasy_squad_players').insert(rows);
    if (insert.error) return NextResponse.json({ success: false, error: insert.error.message }, { status: 500 });

    return NextResponse.json({ success: true, squad, plan });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not carry the squad over.' }, { status: 500 });
  }
}
