import { normalizeSeasonAppointmentImage } from './public-content-normalizers';
import type { PublicSeasonAppointment } from './public-season-appointments';

/**
 * Seconds of scroll per unique card. The marquee originally animated four
 * cards over 42s; keeping the per-card pace constant stops the track from
 * speeding up as the CMS collection grows.
 */
export const MARQUEE_SECONDS_PER_ITEM = 10.5;

export type MarqueeSequence = {
  key: 'primary' | 'duplicate';
  /** The duplicate exists only for seamless looping; it must stay aria-hidden. */
  isDuplicate: boolean;
};

export type SeasonAppointmentsMarqueePlan = {
  /** Every supplied appointment in CMS order with normalised imagery — never capped. */
  appointments: PublicSeasonAppointment[];
  /** A lone card has nothing to scroll past; it renders as a static card instead. */
  animate: boolean;
  sequences: MarqueeSequence[];
  durationSeconds: number;
};

export function planSeasonAppointmentsMarquee(
  appointments: PublicSeasonAppointment[],
): SeasonAppointmentsMarqueePlan {
  const prepared = appointments.map((item) => ({
    ...item,
    image_url: normalizeSeasonAppointmentImage(item.name, item.image_url),
  }));
  const animate = prepared.length > 1;

  return {
    appointments: prepared,
    animate,
    sequences: animate
      ? [
          { key: 'primary', isDuplicate: false },
          { key: 'duplicate', isDuplicate: true },
        ]
      : [{ key: 'primary', isDuplicate: false }],
    durationSeconds: prepared.length * MARQUEE_SECONDS_PER_ITEM,
  };
}
