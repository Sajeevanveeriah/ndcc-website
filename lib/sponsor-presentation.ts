export function sortSponsorsAlphabetically<T extends { name: string }>(sponsors: readonly T[]): T[] {
  return [...sponsors].sort((a, b) => a.name.localeCompare(b.name, 'en-AU', { sensitivity: 'base' }));
}
