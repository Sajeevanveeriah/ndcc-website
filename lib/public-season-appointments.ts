import { createServerClient } from '@/lib/supabase-server';
import { fallbackSeasonAppointments } from '@/lib/fallback-content';

export type PublicSeasonAppointment = {
  id: string;
  name: string;
  role: string;
  image_url: string | null;
  announcement_date: string;
  sort_order: number | null;
  is_active: boolean;
};

export function sortSeasonAppointments(a: PublicSeasonAppointment, b: PublicSeasonAppointment) {
  const sortOrderA = a.sort_order ?? 999;
  const sortOrderB = b.sort_order ?? 999;
  if (sortOrderA !== sortOrderB) return sortOrderA - sortOrderB;

  const announcementDateA = Date.parse(a.announcement_date) || 0;
  const announcementDateB = Date.parse(b.announcement_date) || 0;
  if (announcementDateA !== announcementDateB) return announcementDateB - announcementDateA;

  return a.name.localeCompare(b.name);
}

export function getFallbackSeasonAppointments(): PublicSeasonAppointment[] {
  return [...fallbackSeasonAppointments].sort(sortSeasonAppointments) as PublicSeasonAppointment[];
}

export async function getPublicSeasonAppointments(): Promise<PublicSeasonAppointment[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase server client is not configured for public season appointments.');
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('season_appointments')
    .select('id,name,role,image_url,announcement_date,sort_order,is_active')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('announcement_date', { ascending: false })
    .order('name', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as PublicSeasonAppointment[]).sort(sortSeasonAppointments);
}
