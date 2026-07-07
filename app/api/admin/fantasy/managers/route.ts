/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Read-only manager/squad review feed for admins: every registered fantasy
// manager with their latest squad's status, budget, and captaincy picks.
export async function GET() {
  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Admin session required.' }, { status: 403 });
  }

  try {
    const supabase = createServerClient();
    const [managersResult, squadsResult] = await Promise.all([
      supabase
        .from('fantasy_managers')
        .select('id, display_name, team_name, created_at')
        .order('created_at', { ascending: true }),
      supabase
        .from('fantasy_squads')
        .select('id, manager_id, round_id, status, budget_used, updated_at, created_at, fantasy_rounds(name), fantasy_squad_players(player_id, position_type, is_captain, is_vice_captain, fantasy_players(display_name))')
        .order('created_at', { ascending: false }),
    ]);
    if (managersResult.error) throw new Error(managersResult.error.message);
    if (squadsResult.error) throw new Error(squadsResult.error.message);

    const latestSquadByManager = new Map<string, any>();
    for (const squad of squadsResult.data ?? []) {
      if (!latestSquadByManager.has(squad.manager_id)) latestSquadByManager.set(squad.manager_id, squad);
    }

    const managers = (managersResult.data ?? []).map((manager: any) => {
      const squad = latestSquadByManager.get(manager.id);
      const squadPlayers = squad?.fantasy_squad_players ?? [];
      const captain = squadPlayers.find((item: any) => item.is_captain)?.fantasy_players?.display_name ?? null;
      const viceCaptain = squadPlayers.find((item: any) => item.is_vice_captain)?.fantasy_players?.display_name ?? null;
      return {
        id: manager.id,
        displayName: manager.display_name,
        teamName: manager.team_name,
        registeredAt: manager.created_at,
        squad: squad
          ? {
              status: squad.status,
              roundName: squad.fantasy_rounds?.name ?? 'Pre-season',
              budgetUsed: Number(squad.budget_used ?? 0),
              playerCount: squadPlayers.length,
              starterCount: squadPlayers.filter((item: any) => item.position_type === 'starter').length,
              captain,
              viceCaptain,
              updatedAt: squad.updated_at ?? squad.created_at,
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, managers });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Could not load fantasy managers.' }, { status: 500 });
  }
}
