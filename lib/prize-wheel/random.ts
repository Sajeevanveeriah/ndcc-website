import { randomInt } from 'node:crypto';
import { WHEEL_MAX_DIVISIONS, WHEEL_MIN_DIVISIONS } from './rules';

type RandomInt = (min: number, max: number) => number;

/**
 * Picks the winning wheel number uniformly from 1..divisions using the
 * operating system CSPRNG (node:crypto randomInt, max exclusive). The draw is
 * decided here, on the server, and stored before any wheel animation starts.
 */
export function drawWinningNumber(divisions: number, source: RandomInt = randomInt) {
  if (!Number.isInteger(divisions) || divisions < WHEEL_MIN_DIVISIONS || divisions > WHEEL_MAX_DIVISIONS) {
    throw new Error('Invalid wheel size.');
  }
  const winningNumber = source(1, divisions + 1);
  if (!Number.isInteger(winningNumber) || winningNumber < 1 || winningNumber > divisions) {
    throw new Error('Random source returned a number outside the wheel.');
  }
  return { winningNumber, randomValue: `node:crypto.randomInt(1,${divisions + 1})=${winningNumber}` };
}
