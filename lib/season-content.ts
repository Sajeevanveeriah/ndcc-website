type NamedSeason = { name: string } | null | undefined;

export function renderSeasonContent(value: string | null | undefined, season: NamedSeason) {
  if (!value) return '';
  return value.replaceAll('{season}', season?.name || 'Current Season');
}
