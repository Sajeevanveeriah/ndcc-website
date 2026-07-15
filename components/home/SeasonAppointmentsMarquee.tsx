'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pause, Play } from 'lucide-react';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal from '@/components/common/ScrollReveal';
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
    <section className="section-padding bg-surface-card">
      <div className="container-width">
        <ScrollReveal className="text-center mb-12">
          <span className="section-eyebrow">Season appointments</span>
          <h2 className="section-title">Season appointments</h2>
        </ScrollReveal>
        <ScrollReveal className="relative overflow-hidden" role="region" aria-label="Season appointments">
          {marquee.animate && (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent dark:from-slate-800" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white to-transparent dark:from-slate-800" />
            </>
          )}
          <div
            id={MARQUEE_TRACK_ID}
            className={marquee.animate
              ? 'homepage-marquee-track season-appointments-marquee-track gap-5 py-2'
              : 'flex flex-wrap justify-center gap-5 py-2'}
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
                      className="group relative h-[360px] w-[270px] flex-none rounded-2xl overflow-hidden bg-maroon-900 shadow-md hover:shadow-xl transition-shadow duration-300"
                    >
                      {appointment.image_url ? (
                        <SafeImage
                          src={appointment.image_url}
                          alt={imageAlt}
                          fill
                          className="object-cover img-zoom"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
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
                      <div className="absolute bottom-0 left-0 right-0 p-4 group-hover:-translate-y-1 transition-transform duration-300">
                        <p className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-sky_accent mb-1">
                          {appointment.role}
                        </p>
                        <p className="font-display font-bold text-white text-xl uppercase leading-tight">
                          {appointment.name}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollReveal>
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
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <Link href="/about#committee" className="btn-secondary">View all appointments</Link>
          <p className="text-content-muted font-body text-sm">
            Season appointments are managed in the CMS. Follow us on{' '}
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
