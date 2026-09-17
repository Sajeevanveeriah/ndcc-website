import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

type Member = { managerId: string; displayName: string; teamName: string };
export type DinoManagerStanding = Member & {
  totalPoints: number;
  transferPenalty: number;
  totalNetPoints: number;
  squadValueDinoDollars: number;
  rank: number;
};

// The public page, API and private leagues share the published points/value/name order.
export async function getDinoManagerStandings(
  seasonId: string | null,
  options: { members?: Member[]; includeDemo?: boolean } = {},
): Promise<DinoManagerStanding[]> {
  if (!seasonId || !isServerSupabaseConfigured() || options.members?.length === 0) return [];
  const supabase = createServerClient();
  const memberIds = options.members?.map(member => member.managerId);
  let scoreQuery = supabase.from('fantasy_manager_round_scores')
    .select('manager_id,total_points,transfer_penalty,net_points,fantasy_managers(display_name,team_name)')
    .eq('season_id', seasonId);
  if (memberIds) scoreQuery = scoreQuery.in('manager_id', memberIds);
  const [{ data: scores, error }, { data: demos, error: demoError }] = await Promise.all([
    scoreQuery,
    options.includeDemo
      ? Promise.resolve({ data: [], error: null })
      : supabase.from('fantasy_entries').select('manager_id').eq('season_id', seasonId).eq('is_demo', true),
  ]);
  if (error) throw new Error(error.message);
  if (demoError) throw new Error(demoError.message);
  const excluded = await supabase.from('fantasy_managers').select('id').or('hidden_at.not.is.null,deleted_at.not.is.null,is_active.eq.false');
  if (excluded.error) throw new Error(excluded.error.message);
  const excludedIds = new Set((excluded.data || []).map(row => row.id));
  const demoIds = new Set((demos ?? []).map(row => row.manager_id));
  const grouped = new Map<string, Omit<DinoManagerStanding, 'rank'>>();
  const emptyRow = (member: Member) => ({ ...member, totalPoints: 0, transferPenalty: 0, totalNetPoints: 0, squadValueDinoDollars: 0 });
  for (const member of options.members ?? []) {
    if (!demoIds.has(member.managerId) && !excludedIds.has(member.managerId)) grouped.set(member.managerId, emptyRow(member));
  }
  for (const score of scores ?? []) {
    if (demoIds.has(score.manager_id) || excludedIds.has(score.manager_id)) continue;
    const joined = score.fantasy_managers;
    const manager = Array.isArray(joined) ? joined[0] : joined;
    const row = grouped.get(score.manager_id) ?? emptyRow({
      managerId: score.manager_id,
      displayName: manager?.display_name || 'Dino Coach manager',
      teamName: manager?.team_name || 'Team',
    });
    row.totalPoints += Number(score.total_points ?? 0);
    row.transferPenalty += Number(score.transfer_penalty ?? 0);
    row.totalNetPoints += Number(score.net_points ?? 0);
    grouped.set(row.managerId, row);
  }
  if (!grouped.size) return [];
  const { data: squads, error: squadError } = await supabase.from('fantasy_squads')
    .select('id,manager_id,created_at').eq('season_id', seasonId).eq('status', 'submitted')
    .in('manager_id', Array.from(grouped.keys())).order('created_at', { ascending: false });
  if (squadError) throw new Error(squadError.message);
  const latestSquad = new Map<string, string>();
  for (const squad of squads ?? []) if (!latestSquad.has(squad.manager_id)) latestSquad.set(squad.manager_id, squad.id);
  const squadIds = Array.from(latestSquad.values());
  if (squadIds.length) {
    const [{ data: picks, error: pickError }, { data: prices, error: priceError }] = await Promise.all([
      supabase.from('fantasy_squad_players').select('squad_id,player_id').in('squad_id', squadIds),
      supabase.from('fantasy_player_prices').select('player_id,price_dino_dollars,created_at')
        .eq('season_id', seasonId).not('published_at', 'is', null).order('created_at', { ascending: false }),
    ]);
    if (pickError) throw new Error(pickError.message);
    if (priceError) throw new Error(priceError.message);
    const latestPrice = new Map<string, number>();
    for (const price of prices ?? []) if (!latestPrice.has(price.player_id)) latestPrice.set(price.player_id, Number(price.price_dino_dollars ?? 0));
    const values = new Map<string, number>();
    for (const pick of picks ?? []) values.set(pick.squad_id, (values.get(pick.squad_id) ?? 0) + (latestPrice.get(pick.player_id) ?? 0));
    for (const [managerId, squadId] of latestSquad) grouped.get(managerId)!.squadValueDinoDollars = values.get(squadId) ?? 0;
  }
  return Array.from(grouped.values())
    .sort((a, b) => b.totalPoints - a.totalPoints || b.squadValueDinoDollars - a.squadValueDinoDollars || a.teamName.localeCompare(b.teamName))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
