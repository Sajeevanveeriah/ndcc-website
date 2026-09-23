import { REVERSE_RAFFLE_MAX_NUMBER, REVERSE_RAFFLE_MIN_NUMBER, isReverseRaffleNumber } from '@/lib/raffle-constants';

export const REVERSE_RAFFLE_NUMBERS = Array.from(
  { length: REVERSE_RAFFLE_MAX_NUMBER - REVERSE_RAFFLE_MIN_NUMBER + 1 },
  (_, index) => index + REVERSE_RAFFLE_MIN_NUMBER,
);

export function validReverseRaffleSelection(value: unknown, quantity: number): value is number[] {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 20
    && Array.isArray(value) && value.length === quantity
    && value.every(number => typeof number === 'number' && isReverseRaffleNumber(number))
    && new Set(value).size === quantity;
}
