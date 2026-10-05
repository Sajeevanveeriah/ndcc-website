import { formatCurrency } from '@/lib/utils';
import { SNAIL_RACE_LIMITS, snailRaceSetting } from '@/lib/events/snail-race';
import type { Event } from '@/lib/types';

/** Sponsorship price in dollars, or null when the event does not offer it. */
export function raceSponsorshipPrice(event: Pick<Event, 'race_sponsorship_price'>): number | null {
  const raw = event.race_sponsorship_price;
  if (raw === null || raw === undefined || (typeof raw === 'string' && !String(raw).trim())) return null;
  const price = Number(raw);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

/**
 * "How the night works" for snail racing events. Race numbers come from the
 * event's settings; a sentence is left out when its setting is blank.
 */
export default function SnailRaceDetails({ event }: { event: Event }) {
  const races = snailRaceSetting(event.snail_race_count, SNAIL_RACE_LIMITS.maxRaceCount);
  const perRace = snailRaceSetting(event.snails_per_race, SNAIL_RACE_LIMITS.maxSnailsPerRace);
  const sponsorPrice = raceSponsorshipPrice(event);
  const price = Number(event.ticket_price) || 0;
  return (
    <section aria-labelledby="snail-how-title" className="space-y-3" data-testid="snail-race-details">
      <h2 id="snail-how-title" className="text-2xl!">How the night works</h2>
      <ul className="list-disc space-y-2 pl-5 font-body text-content-secondary text-[17px] leading-relaxed">
        {races && perRace ? (
          <li>The race card is planned as {races} {races === 1 ? 'race' : 'races'} with {perRace} {perRace === 1 ? 'snail' : 'snails'} in each race.</li>
        ) : races ? (
          <li>The race card is planned as {races} {races === 1 ? 'race' : 'races'}.</li>
        ) : perRace ? (
          <li>Each race has {perRace} {perRace === 1 ? 'snail' : 'snails'}.</li>
        ) : null}
        <li>
          {price > 0 ? `Buy snails at ${formatCurrency(price)} each. ` : 'Snails are free to enter. '}
          There is no limit on how many you buy: if more snails are sold, more races are added.
        </li>
        <li>Name your snail and be creative. Offensive or inappropriate names will not be accepted.</li>
        {sponsorPrice !== null && (
          <li>
            Sponsor a race for {sponsorPrice > 0 ? formatCurrency(sponsorPrice) : 'free'}. Each sponsored race is named after its sponsor,
            for example The Jack Elliott Stakes.
          </li>
        )}
        <li>
          Bets for each race are taken on the night in the lead-up to that race. They are placed in person at the club, not online,
          so bring your betting money!
        </li>
      </ul>
    </section>
  );
}
