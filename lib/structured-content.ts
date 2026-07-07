import {
  fallbackCommitteeMembers,
  fallbackFacilityFeatures,
  fallbackHistoryCompetitions,
  fallbackHistoryLineage,
  fallbackHistoryPremierships,
  fallbackLinksFor,
} from '@/lib/fallback-content';
import { createServerClient, isServerSupabaseConfigured } from './supabase-server';

export type PageLinkCard = {
  id: string;
  page_slug: string;
  section_key: string;
  title: string;
  description: string;
  href: string;
  icon: string | null;
  badge: string | null;
  is_external: boolean;
  sort_order: number;
  is_active: boolean;
};

export type FacilityFeature = { id: string; title: string; description: string; icon_key: string; sort_order: number; is_active: boolean };
export type HistoryLineageEntry = { id: string; club_name: string; start_season: string; end_season: string; association_abbr: string; sort_order: number; is_active: boolean };
export type HistoryPremiership = { id: string; team_label: string; season_label: string; competition_abbr: string; grade_label: string; sort_order: number; is_active: boolean };
export type HistoryCompetition = { id: string; abbreviation: string; name: string };
export type CommitteeMemberContent = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  bio?: string | null;
  image_url?: string | null;
  sort_order: number;
  is_active: boolean;
};

function hasSupabaseEnv() { return isServerSupabaseConfigured(); }
function fallbackPageLinks(pageSlug: string, sectionKey: string) { return fallbackLinksFor(pageSlug, sectionKey) as PageLinkCard[]; }
function warnFallback(message: string, metadata?: Record<string, unknown>) { console.warn(message, metadata); }

function sortPageLinks(links: PageLinkCard[]) {
  return [...links].sort((a, b) => {
    const sortOrder = a.sort_order - b.sort_order;
    if (sortOrder !== 0) return sortOrder;
    return a.title.localeCompare(b.title);
  });
}

// All helpers below are uncached live reads: this is mutable CMS content edited
// through admin, so it must be queried at request time. Fallback content is
// reserved for missing Supabase env or a failed query — a successful empty
// result is live truth and is returned as-is, never replaced with seed rows.
export async function getPageLinkCards(pageSlug: string, sectionKey: string): Promise<PageLinkCard[]> {
  const fallback = fallbackPageLinks(pageSlug, sectionKey);
  if (!hasSupabaseEnv()) return fallback;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('page_link_cards')
      .select('*')
      .eq('page_slug', pageSlug)
      .eq('section_key', sectionKey)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) { warnFallback('Public page link cards query failed; using controlled fallbacks.', { pageSlug, sectionKey, error: error.message }); return fallback; }
    return sortPageLinks((data as PageLinkCard[]) || []);
  } catch (error) {
    warnFallback('Public page link cards query failed; using controlled fallbacks.', { pageSlug, sectionKey, error: error instanceof Error ? error.message : 'unknown' });
    return fallback;
  }
}

export async function getFacilityFeatures(): Promise<FacilityFeature[]> {
  if (!hasSupabaseEnv()) return fallbackFacilityFeatures;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('facility_features').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) { warnFallback('Public facility features query failed; using controlled fallbacks.', { error: error.message }); return fallbackFacilityFeatures; }
    return (data as FacilityFeature[]) || [];
  } catch (error) { warnFallback('Public facility features query failed; using controlled fallbacks.', { error: error instanceof Error ? error.message : 'unknown' }); return fallbackFacilityFeatures; }
}

export async function getHistoryLineage(): Promise<HistoryLineageEntry[]> {
  if (!hasSupabaseEnv()) return fallbackHistoryLineage;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('history_lineage_entries').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) { warnFallback('Public history lineage query failed; using controlled fallbacks.', { error: error.message }); return fallbackHistoryLineage; }
    return (data as HistoryLineageEntry[]) || [];
  } catch (error) { warnFallback('Public history lineage query failed; using controlled fallbacks.', { error: error instanceof Error ? error.message : 'unknown' }); return fallbackHistoryLineage; }
}

export async function getHistoryPremierships(): Promise<HistoryPremiership[]> {
  if (!hasSupabaseEnv()) return fallbackHistoryPremierships;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('history_premierships').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) { warnFallback('Public history premierships query failed; using controlled fallbacks.', { error: error.message }); return fallbackHistoryPremierships; }
    return (data as HistoryPremiership[]) || [];
  } catch (error) { warnFallback('Public history premierships query failed; using controlled fallbacks.', { error: error instanceof Error ? error.message : 'unknown' }); return fallbackHistoryPremierships; }
}

export async function getHistoryCompetitions(): Promise<HistoryCompetition[]> {
  if (!hasSupabaseEnv()) return fallbackHistoryCompetitions;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('history_competitions').select('*').order('abbreviation', { ascending: true });
    if (error) { warnFallback('Public history competitions query failed; using controlled fallbacks.', { error: error.message }); return fallbackHistoryCompetitions; }
    return (data as HistoryCompetition[]) || [];
  } catch (error) { warnFallback('Public history competitions query failed; using controlled fallbacks.', { error: error instanceof Error ? error.message : 'unknown' }); return fallbackHistoryCompetitions; }
}

export async function getCommitteeMembers(): Promise<CommitteeMemberContent[]> {
  if (!hasSupabaseEnv()) return fallbackCommitteeMembers;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('committee_members').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) { warnFallback('Public committee members query failed; using controlled fallbacks.', { error: error.message }); return fallbackCommitteeMembers; }
    return (data as CommitteeMemberContent[]) || [];
  } catch (error) { warnFallback('Public committee members query failed; using controlled fallbacks.', { error: error instanceof Error ? error.message : 'unknown' }); return fallbackCommitteeMembers; }
}
