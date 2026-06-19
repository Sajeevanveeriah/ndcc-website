import { normalisePlayHqPlayer } from './normalise';
import type { PlayHqPlayerInput } from './types';
export function transformPlayHqPlayers(players: PlayHqPlayerInput[]) { return players.map((player) => normalisePlayHqPlayer(player, 'playhq-api')); }
