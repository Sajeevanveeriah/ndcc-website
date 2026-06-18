import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

type FantasyRole = 'WK' | 'BAT' | 'AR' | 'BOWL';

type PlayerPayload = {
  id?: string;
  display_name?: string;
  playhq_player_id?: string | null;
  role?: FantasyRole;
  team_label?: string | null;
  active?: boolean;
  price_million?: number | string | null;
};

const roles = new Set(['WK', 'BAT', 'AR', 'BOWL']);

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
  if (!role || !roles.has(role)) errors.push('Role must be WK, BAT, AR, or BOWL.');
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

async function requireFantasyAdmin() {
  return requireSession(['admin', 'president', 'secretary', 'committee']);
}

export async function GET() {
  const user = await requireFantasyAdmin();
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  try {
    const supabase = createServerClient();
    const data = await playersWithPrices(supabase);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load fantasy players.' }, { status: 500 });
  }
}

async function upsertPrice(supabase: ReturnType<typeof createServerClient>, playerId: string, price: number | null) {
  if (price === null) return;
  const { error } = await supabase.from('fantasy_player_prices').insert({ player_id: playerId, price_million: price });
  if (error) throw new Error(error.message);
}

export async function POST(request: Request) {
  const user = await requireFantasyAdmin();
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  try {
    const body = await request.json();
    const rows: PlayerPayload[] = Array.isArray(body.players) ? body.players : [body];
    if (rows.length === 0 || rows.length > 100) return NextResponse.json({ success: false, error: 'Import between 1 and 100 players at a time.' }, { status: 400 });

    const supabase = createServerClient();
    const saved = [];
    for (const row of rows) {
      const parsed = normalisePayload(row);
      if (parsed.errors.length > 0) return NextResponse.json({ success: false, error: `${row.display_name || 'Player'}: ${parsed.errors.join(' ')}` }, { status: 400 });
      const { data, error } = await supabase.from('fantasy_players').insert(parsed.player).select().single();
      if (error) throw new Error(error.message);
      await upsertPrice(supabase, data.id, parsed.price);
      saved.push(data);
    }
    revalidateFantasy();
    return NextResponse.json({ success: true, data: Array.isArray(body.players) ? saved : saved[0] });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not save fantasy player.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireFantasyAdmin();
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  try {
    const body = await request.json() as PlayerPayload;
    if (!body.id) return NextResponse.json({ success: false, error: 'id is required.' }, { status: 400 });
    const parsed = normalisePayload(body);
    if (parsed.errors.length > 0) return NextResponse.json({ success: false, error: parsed.errors.join(' ') }, { status: 400 });

    const supabase = createServerClient();
    const { data, error } = await supabase.from('fantasy_players').update(parsed.player).eq('id', body.id).select().single();
    if (error) throw new Error(error.message);
    await upsertPrice(supabase, body.id, parsed.price);
    revalidateFantasy();
    return NextResponse.json({ success: true, data: { ...data, price_million: parsed.price ?? 0 } });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not update fantasy player.' }, { status: 500 });
  }
}
