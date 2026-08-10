import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

type FantasyRole = 'WK' | 'BAT' | 'AR' | 'BOWL' | 'UNASSIGNED';

type PlayerPayload = {
  id?: string;
  display_name?: string;
  playhq_player_id?: string | null;
  role?: FantasyRole;
  team_label?: string | null;
  active?: boolean;
  price_million?: number | string | null;
};

const roles = new Set(['WK', 'BAT', 'AR', 'BOWL', 'UNASSIGNED']);

function revalidateFantasy() {
  for (const path of ['/fantasy', '/fantasy/squad', '/fantasy/team', '/fantasy/transfers']) {
    try { revalidatePath(path); } catch { /* best-effort */ }
  }
}

function normalisePayload(raw: PlayerPayload) {
  const displayName = typeof raw.display_name === 'string' ? raw.display_name.trim() : '';
  const role = raw.role;
  const price = raw.price_million === '' || raw.price_million === null || raw.price_million === undefined ? null : Number(raw.price_million);
  const errors: string[] = [];

  if (!displayName) errors.push('Player name is required.');
  if (!role || !roles.has(role)) errors.push('Role must be WK, BAT, AR, BOWL or UNASSIGNED.');
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 99.9)) errors.push('Price must be between 0.0 and 99.9.');

  return {
    errors,
    player: {
      display_name: displayName,
      playhq_player_id: typeof raw.playhq_player_id === 'string' && raw.playhq_player_id.trim() ? raw.playhq_player_id.trim() : null,
      role,
      team_label: typeof raw.team_label === 'string' && raw.team_label.trim() ? raw.team_label.trim() : null,
      active: raw.active !== false,
    },
    price: price === null ? null : Number(price.toFixed(1)),
  };
}

async function playersWithPrices(supabase: ReturnType<typeof createServerClient>) {
  const [{ data: players, error: playerError }, { data: prices, error: priceError }] = await Promise.all([
    supabase.from('fantasy_players').select('*').order('display_name', { ascending: true }),
    supabase.from('fantasy_player_prices').select('player_id, price_million, created_at').order('created_at', { ascending: false }),
  ]);
  if (playerError) throw new Error(playerError.message);
  if (priceError) throw new Error(priceError.message);

  const priceByPlayer = new Map<string, number>();
  for (const price of prices ?? []) {
    if (!priceByPlayer.has(price.player_id)) priceByPlayer.set(price.player_id, Number(price.price_million ?? 0));
  }

  return (players ?? []).map((player) => ({ ...player, price_million: priceByPlayer.get(player.id) ?? 0 }));
}

async function requireFantasyPlayers() {
  return requirePermission('fantasy.players');
}

export async function GET() {
  const user = await requireFantasyPlayers();
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  try {
    const supabase = createServerClient();
    const data = await playersWithPrices(supabase);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load fantasy players.' }, { status: 500 });
  }
}

async function currentSeasonId(supabase: ReturnType<typeof createServerClient>) {
  const { data } = await supabase.from('fantasy_seasons').select('id').eq('is_current', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function upsertPrice(supabase: ReturnType<typeof createServerClient>, playerId: string, price: number | null, seasonId: string | null) {
  if (price === null || !seasonId) return;
  const { data: existing } = await supabase.from('fantasy_player_prices').select('id').eq('season_id', seasonId).eq('player_id', playerId).is('effective_round_id', null).limit(1).maybeSingle();
  const result = existing
    ? await supabase.from('fantasy_player_prices').update({ price_million: price }).eq('id', existing.id)
    : await supabase.from('fantasy_player_prices').insert({ player_id: playerId, price_million: price, season_id: seasonId });
  if (result.error) throw new Error(result.error.message);
}

async function syncSeasonMembership(supabase: ReturnType<typeof createServerClient>, playerId: string, player: { role?: FantasyRole; team_label?: string | null; active: boolean; playhq_player_id?: string | null }, seasonId: string | null) {
  if (!seasonId) return;
  const selectable = player.active && player.role !== undefined && player.role !== 'UNASSIGNED';
  const values = { role: player.role, team_label: player.team_label ?? null, active: player.active, selectable, playhq_player_id: player.playhq_player_id ?? null };
  const { data: existing } = await supabase.from('fantasy_season_players').select('id').eq('season_id', seasonId).eq('player_id', playerId).limit(1).maybeSingle();
  const result = existing
    ? await supabase.from('fantasy_season_players').update(values).eq('id', existing.id)
    : await supabase.from('fantasy_season_players').insert({ ...values, season_id: seasonId, player_id: playerId, source: 'admin' });
  if (result.error) throw new Error(result.error.message);
}

export async function POST(request: Request) {
  const user = await requireFantasyPlayers();
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  try {
    const body = await request.json();
    const rows: PlayerPayload[] = Array.isArray(body.players) ? body.players : [body];
    if (rows.length === 0 || rows.length > 100) return NextResponse.json({ success: false, error: 'Import between 1 and 100 players at a time.' }, { status: 400 });

    const supabase = createServerClient();
    const seasonId = await currentSeasonId(supabase);
    const saved = [];
    for (const row of rows) {
      const parsed = normalisePayload(row);
      if (parsed.errors.length > 0) return NextResponse.json({ success: false, error: `${row.display_name || 'Player'}: ${parsed.errors.join(' ')}` }, { status: 400 });
      const { data, error } = await supabase.from('fantasy_players').insert(parsed.player).select().single();
      if (error) throw new Error(error.message);
      await upsertPrice(supabase, data.id, parsed.price, seasonId);
      await syncSeasonMembership(supabase, data.id, parsed.player, seasonId);
      saved.push(data);
    }
    revalidateFantasy();
    return NextResponse.json({ success: true, data: Array.isArray(body.players) ? saved : saved[0] });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not save fantasy player.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireFantasyPlayers();
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  try {
    const body = await request.json() as PlayerPayload;
    if (!body.id) return NextResponse.json({ success: false, error: 'id is required.' }, { status: 400 });
    const parsed = normalisePayload(body);
    if (parsed.errors.length > 0) return NextResponse.json({ success: false, error: parsed.errors.join(' ') }, { status: 400 });

    const supabase = createServerClient();
    const seasonId = await currentSeasonId(supabase);
    const { data, error } = await supabase.from('fantasy_players').update(parsed.player).eq('id', body.id).select().single();
    if (error) throw new Error(error.message);
    await upsertPrice(supabase, body.id, parsed.price, seasonId);
    await syncSeasonMembership(supabase, body.id, parsed.player, seasonId);
    revalidateFantasy();
    return NextResponse.json({ success: true, data: { ...data, price_million: parsed.price ?? 0 } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not update fantasy player.' }, { status: 500 });
  }
}
