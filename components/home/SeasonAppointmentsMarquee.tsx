'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pause, Play } from 'lucide-react';
import SafeImage from '@/components/common/SafeImage';
import { FACEBOOK_URL } from '@/lib/constants';
import { planSeasonAppointmentsMarquee } from '@/lib/season-appointments-marquee';
import type { PublicSeasonAppointment } from '@/lib/public-season-appointments';

type ApiResponse = {
  success: boolean;
  data?: PublicSeasonAppointment[];
  error?: string;
};

const MARQUEE_TRACK_ID = 'season-appointments-marquee-track';

function initials(name: string) {
  return name.split(' ').map((word) => word[0]).join('');
}

export default function SeasonAppointmentsMarquee({ initialAppointments }: { initialAppointments: PublicSeasonAppointment[] }) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [isManuallyPaused, setIsManuallyPaused] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadAppointments() {
      try {
        const response = await fetch('/api/public/season-appointments', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json() as ApiResponse;
        if (!isMounted || !payload.success || !Array.isArray(payload.data)) return;
        setAppointments(payload.data);
      } catch {
        // Keep the static fallback visible if the runtime endpoint is temporarily unavailable.
      }
    }

    loadAppointments();
    return () => { isMounted = false; };
  }, []);

  const marquee = useMemo(() => planSeasonAppointmentsMarquee(appointments), [appointments]);

  // An empty collection is live CMS truth: skip the section rather than
  // animating an empty track. The runtime refresh above can still repopulate it.
  if (marquee.appointments.length === 0) return null;

  return (
    <section className="bg-surface-page py-10 sm:py-12" aria-labelledby="season-appointments-title">
      <div className="container-width">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-edge-strong pb-3">
          <h2 id="season-appointments-title" className="font-display text-2xl font-semibold text-content-primary sm:text-3xl">Season appointments</h2>
          <Link href="/about#committee" className="club-text-link text-base font-semibold">View all appointments</Link>
        </div>
        <div className="relative overflow-hidden" role="region" aria-label="Season appointments">
          {marquee.animate && (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-surface-page to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-surface-page to-transparent" />
            </>
          )}
          <div
            id={MARQUEE_TRACK_ID}
            className={marquee.animate
              ? 'homepage-marquee-track season-appointments-marquee-track gap-4 py-2'
              : 'flex flex-wrap gap-4 py-2'}
            style={marquee.animate
              ? {
                  // Constant per-card pace however many appointments the CMS holds.
                  animationDuration: `${marquee.durationSeconds}s`,
                  ...(isManuallyPaused ? { animationPlayState: 'paused' as const } : {}),
                }
              : undefined}
          >
            {marquee.sequences.map((sequence) => (
              <div
                key={sequence.key}
                className="contents"
                aria-hidden={sequence.isDuplicate || undefined}
              >
                {marquee.appointments.map((appointment) => {
                  const role = appointment.role.trim();
                  const imageAlt = role
                    ? `${appointment.name} appointed as ${role}`
                    : `${appointment.name} season appointment announcement`;

                  return (
                    <div
                      key={`${appointment.id}-${sequence.key}`}
                      className="relative h-[240px] w-[180px] flex-none overflow-hidden rounded-2xl bg-maroon-900"
                    >
                      {appointment.image_url ? (
                        <SafeImage
                          src={appointment.image_url}
                          alt={imageAlt}
                          fill
                          className="object-cover"
                          sizes="180px"
                          fallback={
                            <div className="h-full flex items-center justify-center">
                              <span className="text-gold-200/40 font-display font-black text-6xl">
                                {initials(appointment.name)}
                              </span>
                            </div>
                          }
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center">
                          <span className="text-gold-200/40 font-display font-black text-6xl">
                            {initials(appointment.name)}
                          </span>
                        </div>
                      )}
                      <div
                        className="absolute inset-0"
                        style={{ background: 'linear-gradient(to top, rgba(45,0,0,0.92) 0%, rgba(45,0,0,0.18) 55%, transparent 100%)' }}
                      />
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="mb-1 text-sm font-bold uppercase tracking-[0.08em] text-sky_accent">
                          {appointment.role}
                        </p>
                        <p className="font-display text-lg font-bold uppercase leading-tight text-white">
                          {appointment.name}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {marquee.animate && (
          <div className="season-appointments-marquee-toggle mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setIsManuallyPaused((paused) => !paused)}
              aria-controls={MARQUEE_TRACK_ID}
              aria-label={isManuallyPaused ? 'Play the season appointments marquee' : 'Pause the season appointments marquee'}
              className="inline-flex items-center gap-2 rounded-full border border-edge-strong px-4 py-1.5 font-body text-sm font-semibold text-content-muted transition-colors hover:border-maroon-300 hover:text-maroon-700 focus-ring dark:border-slate-600 dark:text-slate-300 dark:hover:border-maroon-400 dark:hover:text-maroon-200"
            >
              {isManuallyPaused
                ? <Play className="h-4 w-4" aria-hidden="true" />
                : <Pause className="h-4 w-4" aria-hidden="true" />}
              {isManuallyPaused ? 'Play' : 'Pause'}
            </button>
          </div>
        )}
        <div className="mt-4">
          <p className="text-content-muted font-body text-sm">
            Follow us on{' '}
            <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="text-maroon-700 dark:text-maroon-200 hover:underline font-semibold">
              Facebook
            </Link>{' '}
            for updates.
          </p>
        </div>
      </div>
    </section>
  );
}
