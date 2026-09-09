import { createServerClient } from '@/lib/supabase-server';
import { groupPlayerSponsors, normaliseSponsorWebsite, type PlayerSponsor } from '@/lib/player-sponsors';
import { normalisePublicLinkUrl } from '@/lib/public-link-url';
import SafeImage from '@/components/common/SafeImage';

export default async function PlayerSponsorsSection() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return <p className="container-width py-12 text-content-muted">Player sponsorships are currently unavailable. Please check back soon.</p>;
  const { data, error } = await createServerClient().from('player_sponsors')
    .select('id,player_name,player_image_url,sponsor_name,logo_url,website,sort_order,active')
    .eq('active', true).order('sort_order').order('player_name');
  if (error) {
    console.error('[player-sponsors] Unable to load player sponsors:', error.code);
    return <p className="container-width py-12 text-content-muted">Player sponsorships are currently unavailable. Please check back soon.</p>;
  }
  if (!data?.length) return <p className="container-width py-12 text-content-muted">Player sponsorships will appear here when published by the club.</p>;
  return <section aria-labelledby="player-sponsors-title" className="border-y border-edge-subtle bg-surface-card py-6">
    <div className="container-width">
      <h2 id="player-sponsors-title" className="font-display text-xl font-bold text-content-primary">Our players. Their supporters.</h2>
      <ul className="mt-6 grid grid-cols-1 gap-8 pb-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Player sponsors">
        {groupPlayerSponsors(data as PlayerSponsor[]).map((player) => {
          const portrait = normalisePublicLinkUrl(player.player_image_url);
          return <li key={player.key} className="min-w-0 rounded-lg border border-edge-subtle p-5">
            <div className="mb-5 flex items-center gap-3">
              {portrait && <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full"><SafeImage src={portrait} alt={player.player_name} fill sizes="56px" className="object-cover" fallback={null} /></div>}
              <div className="min-w-0"><h3 className="break-words font-display text-lg font-bold text-content-primary">{player.player_name}</h3><p className="mt-1 text-sm text-content-muted">Proudly sponsored by</p></div>
            </div>
            <ul aria-label={`Sponsors of ${player.player_name}`} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {player.sponsors.map((entry) => {
                const website = normaliseSponsorWebsite(entry.website);
                const logo = normalisePublicLinkUrl(entry.logo_url);
                const sponsor = <><div className="relative h-20 w-full rounded bg-white">
                  {logo && <SafeImage src={logo} alt={`${entry.sponsor_name} logo`} fill sizes="200px" className="object-contain p-3" fallback={<span className="block p-3 text-center text-sm font-semibold text-gray-900">{entry.sponsor_name}</span>} />}
                  {!logo && <span className="block p-3 text-center text-sm font-semibold text-gray-900">{entry.sponsor_name}</span>}
                </div><span className="mt-2 block break-words text-sm font-semibold text-content-primary">{entry.sponsor_name}</span></>;
                return <li key={entry.id} className="min-w-0">{website ? <a href={website} target="_blank" rel="sponsored noopener noreferrer" className="block rounded focus-ring hover:underline" aria-label={`Visit ${entry.sponsor_name}, sponsor of ${player.player_name} (opens in a new tab)`}>{sponsor}</a> : sponsor}</li>;
              })}
            </ul>
          </li>;
        })}
      </ul>
    </div>
  </section>;
}
