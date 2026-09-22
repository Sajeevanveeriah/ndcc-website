export const REVERSE_RAFFLE_NUMBERS = Array.from({ length: 100 }, (_, index) => index + 201);

export function validReverseRaffleSelection(value: unknown, quantity: number): value is number[] {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 20
    && Array.isArray(value) && value.length === quantity
    && value.every(number => Number.isInteger(number) && number >= 201 && number <= 300)
    && new Set(value).size === quantity;
}
