import { createServerClient } from './supabase-server';

export type SiteSettings = Record<string, string>;

export type NavigationLink = {
  id: string;
  label: string;
  href: string;
  group_label: string;
  sort_order: number;
  is_active: boolean;
};

export type CmsTeam = {
  id: string;
  name: string;
  grade: string;
  description: string;
  captain: string | null;
  playhq_url: string | null;
  sort_order: number;
  is_active: boolean;
};

export type CmsOption = {
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

export type PublicDownload = {
  id: string;
  title: string;
  href: string;
  category: string;
  description: string;
  sort_order: number;
  is_active: boolean;
};

export type Achievement = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  alt_text: string;
  season_label: string;
  sort_order: number;
  is_active: boolean;
};

function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getSiteSettings(): Promise<SiteSettings> {
  if (!hasSupabaseEnv()) return {};
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('site_settings')
      .select('key,value')
      .eq('is_public', true)
      .order('sort_order', { ascending: true });
    return Object.fromEntries((data ?? []).map((row) => [row.key, row.value || '']));
  } catch {
    return {};
  }
}

export async function getNavigationLinks(groupLabel = 'main'): Promise<NavigationLink[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('navigation_links')
      .select('*')
      .eq('group_label', groupLabel)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as NavigationLink[]) || [];
  } catch {
    return [];
  }
}

export async function getTeams(): Promise<CmsTeam[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('teams')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as CmsTeam[]) || [];
  } catch {
    return [];
  }
}

export async function getSponsorTiers(): Promise<CmsOption[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('sponsor_tiers')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as CmsOption[]) || [];
  } catch {
    return [];
  }
}

export async function getEnquiryTypes(): Promise<CmsOption[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('enquiry_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as CmsOption[]) || [];
  } catch {
    return [];
  }
}

export async function getPublicDownloads(category?: string): Promise<PublicDownload[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServerClient();
    let query = supabase
      .from('public_downloads')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (category) query = query.eq('category', category);
    const { data } = await query;
    return (data as PublicDownload[]) || [];
  } catch {
    return [];
  }
}

export async function getAchievements(): Promise<Achievement[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('achievements')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data as Achievement[]) || [];
  } catch {
    return [];
  }
}
