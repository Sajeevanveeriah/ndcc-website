'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pause, Play } from 'lucide-react';
import LogoChip from '@/components/common/LogoChip';
import MarqueeVisibilityPause from '@/components/home/MarqueeVisibilityPause';
import type { Sponsor } from '@/lib/types';

export default function SponsorsMarquee({ sponsors, durationSeconds }: { sponsors: Sponsor[]; durationSeconds: number }) {
  const [paused, setPaused] = useState(false);

  return (
    <div>
      <div className="homepage-marquee-region relative overflow-hidden" role="region" aria-label="Club sponsor logos">
        <MarqueeVisibilityPause />
        <div
          className={`homepage-marquee-track gap-4 py-2${paused ? ' marquee-manually-paused' : ''}`}
          style={{ animationDuration: `${durationSeconds}s` }}
        >
          {[false, true].map((isDuplicateSequence) => (
            <div key={isDuplicateSequence ? 'duplicate' : 'primary'} className="contents" aria-hidden={isDuplicateSequence || undefined}>
              {sponsors.map((sponsor, index) => {
                const brandedFallback = (
                  <div className="flex h-full w-full items-center justify-center rounded-xl bg-maroon-800 px-3 text-center">
                    <span className="font-display text-sm font-bold uppercase leading-tight tracking-wide text-gold-200">{sponsor.name}</span>
                  </div>
                );
                const chip = (
                  <>
                    <LogoChip
                      name={sponsor.name}
                      src={sponsor.logo_url}
                      surfaceMode={sponsor.logo_surface_mode}
                      paddingClassName={sponsor.logo_padding}
                      objectPosition={sponsor.logo_object_position}
                      width={190}
                      height={70}
                      sizes="190px"
                      className="h-24 w-48 rounded-2xl shadow-soft ring-1 ring-maroon-100/60 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-lift group-hover:ring-2 group-hover:ring-maroon-200/70"
                      imageClassName="max-h-14 w-auto"
                      fallback={brandedFallback}
                    />
                    <span className="sponsor-caption">{sponsor.name}</span>
                  </>
                );
                if (!sponsor.website) {
                  return <div key={`${sponsor.id}-${index}`} className="group flex-none" aria-label={isDuplicateSequence ? undefined : sponsor.name}>{chip}</div>;
                }
                return (
                  <a
                    key={`${sponsor.id}-${index}`}
                    href={sponsor.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={isDuplicateSequence ? undefined : `Visit ${sponsor.name} website`}
                    tabIndex={isDuplicateSequence ? -1 : undefined}
                    className="group block flex-none rounded-2xl focus-ring"
                  >
                    {chip}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          className="btn-secondary inline-flex items-center gap-2"
          aria-pressed={paused}
          aria-label={paused ? 'Play the sponsor logo movement' : 'Pause the sponsor logo movement'}
        >
          {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          {paused ? 'Play logos' : 'Pause logos'}
        </button>
        <Link href="/sponsors" className="btn-secondary">View All Sponsors</Link>
      </div>
    </div>
  );
}
