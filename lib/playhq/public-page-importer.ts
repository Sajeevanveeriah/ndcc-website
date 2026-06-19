import { normalisePlayHqPlayer } from './normalise';
export function parsePublicPlayHqPlayers(html: string, sourceUrl: string) {
  const names: string[] = [];
  const pattern = /data-player-name=["']([^"']+)["']/gi;
  let match = pattern.exec(html);
  while (match) { names.push(match[1]); match = pattern.exec(html); }
  return names.map((displayName) => normalisePlayHqPlayer({ displayName, sourceUrl }, 'playhq-public-page'));
}
