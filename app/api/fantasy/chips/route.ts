import { NextResponse } from 'next/server';
import { requireFantasyManager } from '@/lib/fantasy-manager-auth';
import { CHIP_TYPES, getCurrentRoundId, type ChipType } from '@/lib/fantasy-game';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const auth = await requireFantasyManager(request);
  if (!auth) return NextResponse.json({ success: false, error: 'Fantasy manager sign in is required.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const chipType = String(body.chipType || '') as ChipType;
  if (!CHIP_TYPES.includes(chipType)) return NextResponse.json({ success: false, error: 'Unknown chip type.' }, { status: 400 });
  const roundId = await getCurrentRoundId();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_chips')
    .insert({ manager_id: auth.manager.id, round_id: roundId, chip_type: chipType })
    .select('id, round_id, chip_type, used_at')
    .single();
  if (error) return NextResponse.json({ success: false, error: error.code === '23505' ? 'That chip has already been used this season.' : error.message }, { status: 400 });
  return NextResponse.json({ success: true, chip: data });
}
