import { createServerClient } from '@/lib/supabase-server';

export const PUBLICATION_TYPES = ['monthly_newsletter', 'weekly_newsletter', 'weekly_match_report'] as const;
export type PublicationType = (typeof PUBLICATION_TYPES)[number];

export const PUBLICATION_TYPE_LABELS: Record<PublicationType, string> = {
  monthly_newsletter: 'Monthly Newsletter',
  weekly_newsletter: 'Weekly Newsletter',
  weekly_match_report: 'Match Report',
};

export type PublicPublicationRecord = {
  id: string;
  publication_type: PublicationType;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  issue_date: string;
  season_label: string | null;
  round_label: string | null;
  cover_image_url: string | null;
  document_url: string | null;
  external_url: string | null;
  author: string | null;
  published: boolean;
  published_at: string | null;
  featured: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

const columns =
  'id,publication_type,title,slug,summary,content,issue_date,season_label,round_label,cover_image_url,document_url,external_url,author,published,published_at,featured,display_order,created_at,updated_at';

export function isPublicationType(value: string | null | undefined): value is PublicationType {
  return (PUBLICATION_TYPES as readonly string[]).includes(value ?? '');
}

export function publicationTypeLabel(type: string | null | undefined) {
  return isPublicationType(type) ? PUBLICATION_TYPE_LABELS[type] : 'Publication';
}

/** Uncached request-time read of published publications, newest issue first. */
export async function getPublishedPublications(options?: {
  type?: PublicationType;
  limit?: number;
}): Promise<PublicPublicationRecord[]> {
  try {
    const supabase = createServerClient();
    let query = supabase
      .from('publications')
      .select(columns)
      .eq('published', true)
      .order('issue_date', { ascending: false })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (options?.type) query = query.eq('publication_type', options.type);
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) {
      console.error('[public-publications] list query failed:', error.message);
      return [];
    }
    return (data ?? []) as PublicPublicationRecord[];
  } catch (error) {
    console.error('[public-publications] list query threw:', error);
    return [];
  }
}

/** Fetch one published publication by slug, or null. */
export async function getPublishedPublicationBySlug(slug: string): Promise<PublicPublicationRecord | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('publications')
      .select(columns)
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle();
    if (error) {
      console.error('[public-publications] detail query failed:', error.message);
      return null;
    }
    return (data as PublicPublicationRecord) ?? null;
  } catch (error) {
    console.error('[public-publications] detail query threw:', error);
    return null;
  }
}
