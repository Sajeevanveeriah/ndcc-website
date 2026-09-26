// Deterministic public team slugs for /teams/[slug]. Dependency-free so the
// sitemap and its isolated test harness can import it directly.

/** Deterministic URL slug from a CMS team name ("Women 1sts" -> "women-1sts"). */
export function slugifyTeamName(name: string | null | undefined): string {
  const slug = String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'team';
}

/** Slugs for a team list in its display order; duplicates get -2, -3... */
export function buildTeamSlugs<T extends { name: string }>(teams: T[]): Array<{ team: T; slug: string }> {
  const used = new Set<string>();
  return teams.map((team) => {
    const base = slugifyTeamName(team.name);
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    used.add(slug);
    return { team, slug };
  });
}
