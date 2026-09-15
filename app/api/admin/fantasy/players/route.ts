import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

type FantasyRole = 'WK' | 'BAT' | 'AR' | 'BOWL' | 'UNASSIGNED';

type PlayerPayload = {
  id?: string;
  price_reason?: string;
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
  if (price !== null && (!Number.isFinite(price) || price < 0.1 || price > 2)) errors.push('Price must be between 0.1 and 2.0 million Dino Dollars.');

  return {
    errors,
    player: {
      display_name: displayName,
      playhq_player_id: typeof raw.playhq_player_id === 'string' && raw.playhq_player_id.trim() ? raw.playhq_player_id.trim() : null,
      role,
      team_label: typeof raw.team_label === 'string' && raw.team_label.trim() ? raw.team_label.trim() : null,
      active: raw.active !== false,
    },
    price: price === null ? null : Number(price.toFixed(6)),
  };
}

async function playersWithPrices(supabase: ReturnType<typeof createServerClient>) {
  const seasonId = await currentSeasonId(supabase);
  if (!seasonId) throw new Error('Current season not found.');
  const [{ data: members, error: memberError }, { data: prices, error: priceError }] = await Promise.all([
    supabase.from('fantasy_season_players').select('player_id,role,team_label,active,selectable,eligibility_exclusion,fantasy_players(*)').eq('season_id',seasonId),
    supabase.from('fantasy_player_prices').select('player_id,price_dino_dollars,created_at').eq('season_id',seasonId).not('published_at','is',null).order('created_at',{ascending:false}),
  ]);
  if (memberError) throw new Error(memberError.message);
  if (priceError) throw new Error(priceError.message);
  const latest = new Map<string,number>();
  for (const p of prices || []) if (!latest.has(p.player_id)) latest.set(p.player_id,Number(p.price_dino_dollars)/1000000);
  return (members || []).map(m => ({...(Array.isArray(m.fantasy_players)?m.fantasy_players[0]:m.fantasy_players),id:m.player_id,role:m.role,team_label:m.team_label,active:m.active,selectable:m.selectable,eligibility_exclusion:m.eligibility_exclusion,price_million:latest.get(m.player_id) || 0}));
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

async function upsertPrice(supabase: ReturnType<typeof createServerClient>, playerId: string, price: number | null, seasonId: string | null, actor: string, reason: string) {
  if (price === null || !seasonId) return;
  const result = await supabase.rpc('override_dino_player_price', { target_season_id:seasonId,target_player_id:playerId,new_price:Math.round(price*1000000),actor,reason });
  if (result.error) throw new Error(result.error.message);
}

async function syncSeasonMembership(supabase: ReturnType<typeof createServerClient>, playerId: string, player: { role?: FantasyRole; team_label?: string | null; active: boolean; playhq_player_id?: string | null }, seasonId: string | null) {
  if (!seasonId) return;
  const selectable = player.active;
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
      await upsertPrice(supabase, data.id, parsed.price, seasonId, user.id, row.price_reason || 'Manual player creation');
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
    if (parsed.price !== null && seasonId) {
      const {data:current,error:priceError}=await supabase.from('fantasy_player_prices').select('price_dino_dollars').eq('season_id',seasonId).eq('player_id',body.id).not('published_at','is',null).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(priceError) throw new Error(priceError.message);
      if(Number(current?.price_dino_dollars)!==Math.round(parsed.price*1000000) && String(body.price_reason || '').trim().length<5) return NextResponse.json({success:false,error:'Explain the manual price change in at least five characters.'},{status:400});
    }
    const { data, error } = await supabase.from('fantasy_players').update(parsed.player).eq('id', body.id).select().single();
    if (error) throw new Error(error.message);
    await upsertPrice(supabase, body.id, parsed.price, seasonId, user.id, body.price_reason || '');
    await syncSeasonMembership(supabase, body.id, parsed.player, seasonId);
    revalidateFantasy();
    return NextResponse.json({ success: true, data: { ...data, price_million: parsed.price ?? 0 } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not update fantasy player.' }, { status: 500 });
  }
}
