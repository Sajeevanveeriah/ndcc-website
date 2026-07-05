'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal from '@/components/common/ScrollReveal';
import { FACEBOOK_URL } from '@/lib/constants';
import { normalizeSeasonAppointmentImage } from '@/lib/public-content-normalizers';
import type { PublicSeasonAppointment } from '@/lib/public-season-appointments';

type ApiResponse = {
  success: boolean;
  data?: PublicSeasonAppointment[];
  error?: string;
};

function initials(name: string) {
  return name.split(' ').map((word) => word[0]).join('');
}

export default function SeasonAppointmentsMarquee({ initialAppointments }: { initialAppointments: PublicSeasonAppointment[] }) {
  const [appointments, setAppointments] = useState(initialAppointments);

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

  const seasonAppointments = useMemo(() => appointments.map((item) => ({
    ...item,
    image_url: normalizeSeasonAppointmentImage(item.name, item.image_url),
  })), [appointments]);

  return (
    <section className="section-padding bg-white">
      <div className="container-width">
        <ScrollReveal className="text-center mb-12">
          <span className="section-eyebrow">2026/27 Season</span>
          <h2 className="section-title">2026/27 Season Appointments</h2>
        </ScrollReveal>
        <ScrollReveal className="relative overflow-hidden" role="region" aria-label="2026/27 season appointments carousel">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent dark:from-slate-800" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white to-transparent dark:from-slate-800" />
          <div className="homepage-marquee-track gap-5 py-2">
            {[false, true].map((isDuplicateSequence) => (
              <div
                key={isDuplicateSequence ? 'duplicate' : 'primary'}
                className="contents"
                aria-hidden={isDuplicateSequence || undefined}
              >
                {seasonAppointments.map((appointment) => {
                  const role = appointment.role.trim();
                  const imageAlt = role
                    ? `${appointment.name} appointed as ${role}`
                    : `${appointment.name} season appointment announcement`;

                  return (
                    <div
                      key={`${appointment.id}-${isDuplicateSequence ? 'duplicate' : 'primary'}`}
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
        <p className="text-center text-gray-500 font-body text-sm mt-8">
          More appointments to be announced. Follow us on{' '}
          <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="text-maroon-700 hover:underline font-semibold">
            Facebook
          </Link>{' '}
          for updates.
        </p>
      </div>
    </section>
  );
}
