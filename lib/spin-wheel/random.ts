import { randomInt } from 'node:crypto';
import { SPIN_REFERENCE_ALPHABET } from '@/lib/spin-wheel/rules';

type RandomInt = (min: number, max: number) => number;

export type PickableSegment = { id: string; weight: number; stock: number | null };

/**
 * Picks a segment with probability weight / total weight, over segments with a
 * weight above 0 that are in stock, using the operating system CSPRNG
 * (node:crypto randomInt, max exclusive). Decided on the server and recorded
 * before any wheel animation starts.
 */
export function pickWeightedSegment<T extends PickableSegment>(segments: readonly T[], exclude: ReadonlySet<string> = new Set(), source: RandomInt = randomInt) {
  const pickable = segments.filter(segment => Number.isInteger(segment.weight) && segment.weight > 0
    && (segment.stock === null || segment.stock > 0) && !exclude.has(segment.id));
  const total = pickable.reduce((sum, segment) => sum + segment.weight, 0);
  if (!pickable.length || !Number.isSafeInteger(total) || total < 1) throw new Error('No segment can be won.');
  const roll = source(0, total);
  if (!Number.isInteger(roll) || roll < 0 || roll >= total) throw new Error('Random source returned a value outside the wheel.');
  let cumulative = 0;
  for (const segment of pickable) {
    cumulative += segment.weight;
    if (roll < cumulative) return { segment, randomSource: `node:crypto.randomInt(0,${total})=${roll}` };
  }
  throw new Error('Weighted pick failed.');
}

/** SPIN- plus 6 characters from an alphabet without I, L, O or U. */
export function spinResultReference(source: RandomInt = randomInt): string {
  let suffix = '';
  for (let index = 0; index < 6; index += 1) suffix += SPIN_REFERENCE_ALPHABET[source(0, SPIN_REFERENCE_ALPHABET.length)];
  return `SPIN-${suffix}`;
}
