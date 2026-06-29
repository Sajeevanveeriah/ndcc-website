import { unstable_cache } from 'next/cache';
import {
  fallbackCommitteeMembers,
  fallbackFacilityFeatures,
  fallbackHistoryCompetitions,
  fallbackHistoryLineage,
  fallbackHistoryPremierships,
  fallbackLinksFor,
  isProductionStaticBuild,
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
export type CommitteeMemberContent = { id: string; name: string; role: string; sort_order: number; is_active: boolean };

function hasSupabaseEnv() { return isServerSupabaseConfigured(); }
function fallbackPageLinks(pageSlug: string, sectionKey: string) { return fallbackLinksFor(pageSlug, sectionKey) as PageLinkCard[]; }
function warnFallback(message: string, metadata?: Record<string, unknown>) { console.warn(message, metadata); }

async function getPageLinkCardsUncached(pageSlug: string, sectionKey: string): Promise<PageLinkCard[]> {
  const fallback = fallbackPageLinks(pageSlug, sectionKey);
  if (isProductionStaticBuild || !hasSupabaseEnv()) return fallback;
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
    const rows = (data as PageLinkCard[]) || [];
    return rows.length > 0 ? rows : fallback;
  } catch (error) {
    warnFallback('Public page link cards query failed; using controlled fallbacks.', { pageSlug, sectionKey, error: error instanceof Error ? error.message : 'unknown' });
    return fallback;
  }
}

export const getPageLinkCards = unstable_cache(getPageLinkCardsUncached, ['page-link-cards'], { revalidate: 300, tags: ['page-link-cards'] });

async function getFacilityFeaturesUncached(): Promise<FacilityFeature[]> {
  if (isProductionStaticBuild || !hasSupabaseEnv()) return fallbackFacilityFeatures;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('facility_features').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) { warnFallback('Public facility features query failed; using controlled fallbacks.', { error: error.message }); return fallbackFacilityFeatures; }
    const rows = (data as FacilityFeature[]) || [];
    return rows.length > 0 ? rows : fallbackFacilityFeatures;
  } catch (error) { warnFallback('Public facility features query failed; using controlled fallbacks.', { error: error instanceof Error ? error.message : 'unknown' }); return fallbackFacilityFeatures; }
}
export const getFacilityFeatures = unstable_cache(getFacilityFeaturesUncached, ['facility-features'], { revalidate: 300, tags: ['facility-features'] });

async function getHistoryLineageUncached(): Promise<HistoryLineageEntry[]> {
  if (isProductionStaticBuild || !hasSupabaseEnv()) return fallbackHistoryLineage;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('history_lineage_entries').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) { warnFallback('Public history lineage query failed; using controlled fallbacks.', { error: error.message }); return fallbackHistoryLineage; }
    const rows = (data as HistoryLineageEntry[]) || [];
    return rows.length > 0 ? rows : fallbackHistoryLineage;
  } catch (error) { warnFallback('Public history lineage query failed; using controlled fallbacks.', { error: error instanceof Error ? error.message : 'unknown' }); return fallbackHistoryLineage; }
}
export const getHistoryLineage = unstable_cache(getHistoryLineageUncached, ['history-lineage'], { revalidate: 300, tags: ['history'] });

async function getHistoryPremiershipsUncached(): Promise<HistoryPremiership[]> {
  if (isProductionStaticBuild || !hasSupabaseEnv()) return fallbackHistoryPremierships;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('history_premierships').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) { warnFallback('Public history premierships query failed; using controlled fallbacks.', { error: error.message }); return fallbackHistoryPremierships; }
    const rows = (data as HistoryPremiership[]) || [];
    return rows.length > 0 ? rows : fallbackHistoryPremierships;
  } catch (error) { warnFallback('Public history premierships query failed; using controlled fallbacks.', { error: error instanceof Error ? error.message : 'unknown' }); return fallbackHistoryPremierships; }
}
export const getHistoryPremierships = unstable_cache(getHistoryPremiershipsUncached, ['history-premierships'], { revalidate: 300, tags: ['history'] });

async function getHistoryCompetitionsUncached(): Promise<HistoryCompetition[]> {
  if (isProductionStaticBuild || !hasSupabaseEnv()) return fallbackHistoryCompetitions;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('history_competitions').select('*').order('abbreviation', { ascending: true });
    if (error) { warnFallback('Public history competitions query failed; using controlled fallbacks.', { error: error.message }); return fallbackHistoryCompetitions; }
    const rows = (data as HistoryCompetition[]) || [];
    return rows.length > 0 ? rows : fallbackHistoryCompetitions;
  } catch (error) { warnFallback('Public history competitions query failed; using controlled fallbacks.', { error: error instanceof Error ? error.message : 'unknown' }); return fallbackHistoryCompetitions; }
}
export const getHistoryCompetitions = unstable_cache(getHistoryCompetitionsUncached, ['history-competitions'], { revalidate: 300, tags: ['history'] });

async function getCommitteeMembersUncached(): Promise<CommitteeMemberContent[]> {
  if (isProductionStaticBuild || !hasSupabaseEnv()) return fallbackCommitteeMembers;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('committee_members').select('*').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) { warnFallback('Public committee members query failed; using controlled fallbacks.', { error: error.message }); return fallbackCommitteeMembers; }
    const rows = (data as CommitteeMemberContent[]) || [];
    return rows.length > 0 ? rows : fallbackCommitteeMembers;
  } catch (error) { warnFallback('Public committee members query failed; using controlled fallbacks.', { error: error instanceof Error ? error.message : 'unknown' }); return fallbackCommitteeMembers; }
}
export const getCommitteeMembers = unstable_cache(getCommitteeMembersUncached, ['committee-members'], { revalidate: 300, tags: ['committee-members'] });
