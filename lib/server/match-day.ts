import 'server-only';
import { createServerClient } from '@/lib/supabase-server';
import {
  type ClubWinner, type TeamSheet, type WinnerCategory,
  clubToday, currentTeamSheets, normalisePlayers, normaliseTeamSheetImages, publicWinnerName, selectionsByFantasyPlayer,
} from '@/lib/match-day';
import { normaliseMediaUrl } from '@/lib/media-url';

export const TEAM_SHEET_COLUMNS = 'id,team_id,team_name,match_date,round_label,season_label,opponent,venue,start_time,players,notes,document_url,images,published,published_at,created_at,updated_at';
export const WINNER_COLUMNS = 'id,category,title,winner_name,show_full_name,prize,details,draw_date,round_label,season_label,player_sponsor_id,sponsor_name,image_url,image_alt,published,published_at,sort_order,created_at,updated_at';

/** What a public page may show about a team sheet (no internal ids beyond the Dino link). */
export type PublicTeamSheet = Omit<TeamSheet, 'published' | 'published_at' | 'created_at' | 'updated_at'>;
/** What a public page may show about a winner: the name is already privacy-formatted. */
export type PublicWinner = Omit<ClubWinner, 'winner_name' | 'show_full_name' | 'published' | 'published_at' | 'created_at' | 'updated_at' | 'player_sponsor_id'> & { display_name: string };

function publicClient() {
  return createServerClient({ retryReads: true, publicReadCache: true });
}

function toPublicSheet(row: TeamSheet): PublicTeamSheet {
  return {
    id: row.id, team_id: row.team_id, team_name: row.team_name, match_date: row.match_date,
    round_label: row.round_label, season_label: row.season_label, opponent: row.opponent, venue: row.venue,
    start_time: row.start_time, players: normalisePlayers(row.players), notes: row.notes,
    document_url: normaliseMediaUrl(row.document_url) || '',
    images: normaliseTeamSheetImages(row.images, row).map((image) => ({ ...image, url: normaliseMediaUrl(image.url) || '' })).filter((image) => image.url),
  };
}

function toPublicWinner(row: ClubWinner): PublicWinner {
  return {
    id: row.id, category: row.category, title: row.title, display_name: publicWinnerName(row), prize: row.prize,
    details: row.details, draw_date: row.draw_date, round_label: row.round_label, season_label: row.season_label,
    sponsor_name: row.sponsor_name, image_url: normaliseMediaUrl(row.image_url) || '', image_alt: row.image_alt,
    sort_order: row.sort_order,
  };
}

const now = () => new Date().toISOString();

/** Published sheets from the last week onwards, reduced to the one that matters per team. */
export async function getCurrentTeamSheets(): Promise<PublicTeamSheet[]> {
  const today = clubToday();
  const from = new Date(`${today}T00:00:00Z`); from.setUTCDate(from.getUTCDate() - 6);
  const { data, error } = await publicClient().from('team_sheets').select(TEAM_SHEET_COLUMNS)
    .eq('published', true).or(`published_at.is.null,published_at.lte.${now()}`)
    .gte('match_date', from.toISOString().slice(0, 10)).order('match_date', { ascending: true }).limit(100);
  if (error) {
    console.error('[match-day] team sheets query failed:', error.message);
    throw new Error('Team sheets temporarily unavailable');
  }
  return currentTeamSheets((data ?? []) as TeamSheet[], today).map(toPublicSheet);
}

/** The current sheet for one team (matched by team id or name), or null. */
export async function getCurrentTeamSheetFor(team: { id?: string | null; name: string }): Promise<PublicTeamSheet | null> {
  const sheets = await getCurrentTeamSheets();
  return sheets.find((sheet) => (team.id && sheet.team_id === team.id) || sheet.team_name.toLowerCase() === team.name.toLowerCase()) || null;
}

/** Dino Coach: player id -> current team naming that player (12th players excluded). */
export async function getDinoSelectionBadges() {
  return selectionsByFantasyPlayer(await getCurrentTeamSheets());
}

export async function getPublishedWinners(options: { category?: WinnerCategory; season?: string; limit?: number; since?: string } = {}): Promise<PublicWinner[]> {
  let query = publicClient().from('club_winners').select(WINNER_COLUMNS)
    .eq('published', true).or(`published_at.is.null,published_at.lte.${now()}`)
    .order('draw_date', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (options.category) query = query.eq('category', options.category);
  if (options.season) query = query.eq('season_label', options.season);
  if (options.since) query = query.gte('draw_date', options.since);
  query = query.limit(Math.min(Math.max(options.limit || 200, 1), 500));
  const { data, error } = await query;
  if (error) {
    console.error('[match-day] winners query failed:', error.message);
    throw new Error('Winners temporarily unavailable');
  }
  return ((data ?? []) as ClubWinner[]).map(toPublicWinner);
}

/** Season labels used by published winners, newest first. */
export async function getWinnerSeasons(): Promise<string[]> {
  const { data, error } = await publicClient().from('club_winners').select('season_label,draw_date')
    .eq('published', true).neq('season_label', '').order('draw_date', { ascending: false }).limit(500);
  if (error) return [];
  return [...new Set((data ?? []).map((row) => String(row.season_label)))];
}
