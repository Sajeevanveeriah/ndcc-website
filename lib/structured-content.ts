import { unstable_cache } from 'next/cache';
import { isProductionStaticBuild } from '@/lib/fallback-content';
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



export type FacilityFeature = {
  id: string;
  title: string;
  description: string;
  icon_key: string;
  sort_order: number;
  is_active: boolean;
};

export type HistoryLineageEntry = {
  id: string;
  club_name: string;
  start_season: string;
  end_season: string;
  association_abbr: string;
  sort_order: number;
  is_active: boolean;
};

export type HistoryPremiership = {
  id: string;
  team_label: string;
  season_label: string;
  competition_abbr: string;
  grade_label: string;
  sort_order: number;
  is_active: boolean;
};

export type HistoryCompetition = {
  id: string;
  abbreviation: string;
  name: string;
};

export type CommitteeMemberContent = {
  id: string;
  name: string;
  role: string;
  sort_order: number;
  is_active: boolean;
};

function hasSupabaseEnv() {
  return isServerSupabaseConfigured();
}

async function getPageLinkCardsUncached(pageSlug: string, sectionKey: string): Promise<PageLinkCard[]> {
  if (isProductionStaticBuild || !hasSupabaseEnv()) {
    console.error('Supabase is not configured for page link cards.', { pageSlug, sectionKey });
    return [];
  }
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('page_link_cards')
      .select('*')
      .eq('page_slug', pageSlug)
      .eq('section_key', sectionKey)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      console.error('Public page link cards query failed.', { pageSlug, sectionKey, error: error.message });
      return [];
    }
    return (data as PageLinkCard[]) || [];
  } catch (error) {
    console.error('Public page link cards query timed out or failed.', { pageSlug, sectionKey, error });
    return [];
  }
}

export const getPageLinkCards = unstable_cache(getPageLinkCardsUncached, ['page-link-cards'], {
  revalidate: 300,
  tags: ['page-link-cards'],
});

async function getFacilityFeaturesUncached(): Promise<FacilityFeature[]> {
  if (isProductionStaticBuild || !hasSupabaseEnv()) { console.error('Supabase is not configured for facility features.'); return []; }
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('facility_features')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as FacilityFeature[]) || [];
  } catch (error) {
    console.error('Public structured content query failed.', { error });
    return [];
  }
}

export const getFacilityFeatures = unstable_cache(getFacilityFeaturesUncached, ['facility-features'], {
  revalidate: 300,
  tags: ['facility-features'],
});

async function getHistoryLineageUncached(): Promise<HistoryLineageEntry[]> {
  if (isProductionStaticBuild || !hasSupabaseEnv()) { console.error('Supabase is not configured for history lineage.'); return []; }
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('history_lineage_entries')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as HistoryLineageEntry[]) || [];
  } catch (error) {
    console.error('Public structured content query failed.', { error });
    return [];
  }
}

export const getHistoryLineage = unstable_cache(getHistoryLineageUncached, ['history-lineage'], {
  revalidate: 300,
  tags: ['history'],
});

async function getHistoryPremiershipsUncached(): Promise<HistoryPremiership[]> {
  if (isProductionStaticBuild || !hasSupabaseEnv()) { console.error('Supabase is not configured for history premierships.'); return []; }
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('history_premierships')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as HistoryPremiership[]) || [];
  } catch (error) {
    console.error('Public structured content query failed.', { error });
    return [];
  }
}

export const getHistoryPremierships = unstable_cache(getHistoryPremiershipsUncached, ['history-premierships'], {
  revalidate: 300,
  tags: ['history'],
});

async function getHistoryCompetitionsUncached(): Promise<HistoryCompetition[]> {
  if (isProductionStaticBuild || !hasSupabaseEnv()) { console.error('Supabase is not configured for history competitions.'); return []; }
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('history_competitions')
      .select('*')
      .order('abbreviation', { ascending: true });
    return (data as HistoryCompetition[]) || [];
  } catch (error) {
    console.error('Public structured content query failed.', { error });
    return [];
  }
}

export const getHistoryCompetitions = unstable_cache(getHistoryCompetitionsUncached, ['history-competitions'], {
  revalidate: 300,
  tags: ['history'],
});

async function getCommitteeMembersUncached(): Promise<CommitteeMemberContent[]> {
  if (!hasSupabaseEnv()) { console.error('Supabase is not configured for committee members.'); return []; }
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('committee_members')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as CommitteeMemberContent[]) || [];
  } catch (error) {
    console.error('Public structured content query failed.', { error });
    return [];
  }
}

export const getCommitteeMembers = unstable_cache(getCommitteeMembersUncached, ['committee-members'], {
  revalidate: 300,
  tags: ['committee-members'],
});
