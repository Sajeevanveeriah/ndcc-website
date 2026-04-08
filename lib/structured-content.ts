import { createServerClient } from './supabase-server';

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
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getPageLinkCards(pageSlug: string, sectionKey: string): Promise<PageLinkCard[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('page_link_cards')
      .select('*')
      .eq('page_slug', pageSlug)
      .eq('section_key', sectionKey)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as PageLinkCard[]) || [];
  } catch {
    return [];
  }
}

export async function getFacilityFeatures(): Promise<FacilityFeature[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('facility_features')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as FacilityFeature[]) || [];
  } catch {
    return [];
  }
}

export async function getHistoryLineage(): Promise<HistoryLineageEntry[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('history_lineage_entries')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as HistoryLineageEntry[]) || [];
  } catch {
    return [];
  }
}

export async function getHistoryPremierships(): Promise<HistoryPremiership[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('history_premierships')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as HistoryPremiership[]) || [];
  } catch {
    return [];
  }
}


export async function getHistoryCompetitions(): Promise<HistoryCompetition[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('history_competitions')
      .select('*')
      .order('abbreviation', { ascending: true });
    return (data as HistoryCompetition[]) || [];
  } catch {
    return [];
  }
}

export async function getCommitteeMembers(): Promise<CommitteeMemberContent[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('committee_members')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as CommitteeMemberContent[]) || [];
  } catch {
    return [];
  }
}
