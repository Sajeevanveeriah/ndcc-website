import type { Metadata, Viewport } from 'next';
import InstallDinoCoach from '@/components/fantasy/InstallDinoCoach';
import DinoFeedbackNotice from '@/components/fantasy/DinoFeedbackNotice';
import DinoServiceUnavailable from '@/components/fantasy/DinoServiceUnavailable';
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
// Same brand maroon as the root layout's theme-color (BRAND_COLOURS.maroon;
// inlined because scripts/test-dino-recovery.mjs loads this file in isolation).
export const viewport: Viewport = { themeColor: '#880000' };

export const dynamic = 'force-dynamic';

export default async function FantasyLayout({ children }: { children: React.ReactNode }) {
  if (!isServerSupabaseConfigured()) return <DinoServiceUnavailable />;

  let publicLaunchEnabled = false;
  try {
    const supabase = createServerClient({ retryReads: true });
    const { data: season, error: seasonError } = await supabase
      .from('fantasy_seasons')
      .select('id')
      .eq('is_current', true)
      .limit(1)
      .maybeSingle();
    if (seasonError) throw seasonError;

    if (season?.id) {
      const { data: settings, error: settingsError } = await supabase
        .from('fantasy_dino_settings')
        .select('public_launch_enabled')
        .eq('season_id', season.id)
        .maybeSingle();
      if (settingsError) throw settingsError;
      publicLaunchEnabled = settings?.public_launch_enabled === true;
    }
  } catch {
    return <DinoServiceUnavailable />;
  }
  if (!publicLaunchEnabled) notFound();

  return <><DinoFeedbackNotice />{children}<InstallDinoCoach /></>;
}
