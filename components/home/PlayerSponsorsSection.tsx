import { createServerClient } from '@/lib/supabase-server';
import type { PlayerSponsor } from '@/lib/player-sponsors';
import { normalisePublicLinkUrl } from '@/lib/public-link-url';
import SafeImage from '@/components/common/SafeImage';

export default async function PlayerSponsorsSection() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return <p className="container-width py-12 text-content-muted">Player sponsorships are currently unavailable. Please check back soon.</p>;
  const { data, error } = await createServerClient().from('player_sponsors')
    .select('id,player_name,player_image_url,sponsor_name,logo_url,website,sort_order,active')
    .eq('active', true).order('sort_order').order('player_name');
  if (error) {
    console.error('[player-sponsors] Unable to load homepage feature:', error.code);
    return <p className="container-width py-12 text-content-muted">Player sponsorships are currently unavailable. Please check back soon.</p>;
  }
  if (!data?.length) return <p className="container-width py-12 text-content-muted">Player sponsorships will appear here when published by the club.</p>;
  return <section aria-labelledby="player-sponsors-title" className="border-y border-edge-subtle bg-surface-card py-6">
    <div className="container-width">
      <h2 id="player-sponsors-title" className="font-display text-xl font-bold text-content-primary">Our players. Their supporters.</h2>
      <ul className="mt-6 grid grid-cols-1 gap-8 pb-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Player sponsors">
        {(data as PlayerSponsor[]).map((entry) => {
          const website = normalisePublicLinkUrl(entry.website);
          const logo = normalisePublicLinkUrl(entry.logo_url);
          const portrait = normalisePublicLinkUrl(entry.player_image_url);
          const sponsor = <><div className="relative flex h-16 w-36 items-center justify-center rounded bg-white p-2">
            {logo && <SafeImage src={logo} alt={`${entry.sponsor_name} logo`} fill sizes="144px" className="object-contain p-2" fallback={<span className="text-center text-sm font-semibold text-gray-900">{entry.sponsor_name}</span>} />}
            {!logo && <span className="text-center text-sm font-semibold text-gray-900">{entry.sponsor_name}</span>}
          </div><span className="mt-1 block text-sm font-semibold text-content-primary break-words">{entry.sponsor_name}</span></>;
          return <li key={entry.id} className="flex min-w-0 items-center gap-4 border-b border-edge-subtle py-6">
            <div className="min-w-0 flex-1">
              {portrait && <div className="relative mb-2 h-14 w-14 overflow-hidden rounded-full"><SafeImage src={portrait} alt={entry.player_name} fill sizes="56px" className="object-cover" fallback={null} /></div>}
              <p className="break-words font-display text-lg font-bold text-content-primary">{entry.player_name}</p>
              <p className="mt-1 text-sm text-content-muted">Proudly sponsored by</p>
            </div>
            <div className="w-36 shrink-0">{website ? <a href={website} target="_blank" rel="sponsored noopener noreferrer" className="block rounded focus-ring hover:underline" aria-label={`Visit ${entry.sponsor_name}, sponsor of ${entry.player_name} (opens in a new tab)`}>{sponsor}</a> : sponsor}</div>
          </li>;
        })}
      </ul>
    </div>
  </section>;
}
