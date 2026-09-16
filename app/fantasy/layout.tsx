import type { Metadata, Viewport } from 'next';
import InstallDinoCoach from '@/components/fantasy/InstallDinoCoach';
import { notFound } from 'next/navigation';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export const metadata: Metadata = {
  manifest: '/dino-coach.webmanifest',
  appleWebApp: { capable: true, title: 'Dino Coach', statusBarStyle: 'default' },
  // Nested metadata replaces the root icons, so retain the browser favicon
  // alongside the Apple touch icon used when installing Dino Coach.
  icons: {
    icon: { url: '/icons/dino-coach-192.png', type: 'image/png', sizes: '192x192' },
    shortcut: '/icons/dino-coach-192.png',
    apple: '/icons/dino-coach-192.png',
  },
};
export const viewport: Viewport = { themeColor:'#800020' };

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

  return <>{children}<InstallDinoCoach /></>;
}
