import { NAV_LINKS } from '@/lib/constants';
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


export const fallbackHeaderLinks: PageLinkCard[] = NAV_LINKS.map((link, index) => ({
  id: `fallback-header-${index + 1}`,
  page_slug: 'site',
  section_key: 'header_nav',
  title: link.label,
  description: '',
  href: link.href,
  icon: null,
  badge: null,
  is_external: Boolean(link.openInNewTab),
  sort_order: index + 1,
  is_active: true,
}));

export const fallbackFooterQuickLinks: PageLinkCard[] = NAV_LINKS.slice(0, 6).map((link, index) => ({
  id: `fallback-footer-quick-${index + 1}`,
  page_slug: 'site',
  section_key: 'footer_quick_links',
  title: link.label,
  description: '',
  href: link.href,
  icon: null,
  badge: null,
  is_external: Boolean(link.openInNewTab),
  sort_order: index + 1,
  is_active: true,
}));

export const fallbackFooterGetInvolvedLinks: PageLinkCard[] = [
  ...NAV_LINKS.slice(6).map((link, index) => ({
    id: `fallback-footer-involved-${index + 1}`,
    page_slug: 'site',
    section_key: 'footer_get_involved',
    title: link.label,
    description: '',
    href: link.href,
    icon: null,
    badge: null,
    is_external: Boolean(link.openInNewTab),
    sort_order: index + 1,
    is_active: true,
  })),
  {
    id: 'fallback-footer-committee-login',
    page_slug: 'site',
    section_key: 'footer_get_involved',
    title: 'Committee Login',
    description: '',
    href: '/admin/login',
    icon: null,
    badge: null,
    is_external: false,
    sort_order: 99,
    is_active: true,
  },
];

export const fallbackFooterAffiliationLinks: PageLinkCard[] = [
  { id: 'fallback-affiliation-gca', page_slug: 'site', section_key: 'footer_affiliations', title: 'Geelong Cricket Association', description: '', href: 'https://cricketgeelong.com.au/', icon: null, badge: null, is_external: true, sort_order: 1, is_active: true },
  { id: 'fallback-affiliation-newcomb-power', page_slug: 'site', section_key: 'footer_affiliations', title: 'Newcomb Power Football & Netball Club', description: '', href: 'https://newcombpowerfnc.com.au/', icon: null, badge: null, is_external: true, sort_order: 2, is_active: true },
  { id: 'fallback-affiliation-softball', page_slug: 'site', section_key: 'footer_affiliations', title: 'Softball club details', description: '', href: '/contact?topic=softball', icon: null, badge: null, is_external: false, sort_order: 3, is_active: true },
  { id: 'fallback-affiliation-darts', page_slug: 'site', section_key: 'footer_affiliations', title: 'Darts club details', description: '', href: '/contact?topic=darts', icon: null, badge: null, is_external: false, sort_order: 4, is_active: true },
  { id: 'fallback-affiliation-good-sports', page_slug: 'site', section_key: 'footer_affiliations', title: 'Good Sports Level 3', description: '', href: 'https://goodsports.com.au/', icon: null, badge: null, is_external: true, sort_order: 5, is_active: true },
];

export function fallbackLinksForSection(pageSlug: string, sectionKey: string): PageLinkCard[] {
  if (pageSlug !== 'site') return [];
  if (sectionKey === 'header_nav') return fallbackHeaderLinks;
  if (sectionKey === 'footer_quick_links') return fallbackFooterQuickLinks;
  if (sectionKey === 'footer_get_involved') return fallbackFooterGetInvolvedLinks;
  if (sectionKey === 'footer_affiliations') return fallbackFooterAffiliationLinks;
  return [];
}

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
  if (!hasSupabaseEnv()) return fallbackLinksForSection(pageSlug, sectionKey);
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('page_link_cards')
      .select('*')
      .eq('page_slug', pageSlug)
      .eq('section_key', sectionKey)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return data?.length ? (data as PageLinkCard[]) : fallbackLinksForSection(pageSlug, sectionKey);
  } catch {
    return fallbackLinksForSection(pageSlug, sectionKey);
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
