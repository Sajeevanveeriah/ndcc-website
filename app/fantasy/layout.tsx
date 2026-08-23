import { notFound } from 'next/navigation';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function FantasyLayout({ children }: { children: React.ReactNode }) {
  if (!isServerSupabaseConfigured()) notFound();

  try {
    const supabase = createServerClient();
    const { data: season } = await supabase
      .from('fantasy_seasons')
      .select('id')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle();
    if (!season?.id) notFound();

    const { data: settings } = await supabase
      .from('fantasy_dino_settings')
      .select('public_launch_enabled')
      .eq('season_id', season.id)
      .maybeSingle();
    if (settings?.public_launch_enabled !== true) notFound();
  } catch {
    notFound();
  }

  return children;
}
