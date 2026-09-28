// Men's / women's / junior grouping for fixtures on the home page and
// /fixtures. Pure (no imports), so it is unit tested directly in
// scripts/test-team-category.mjs.
//
// PlayHQ gives no category field, so the category comes from the team, grade
// or competition name. Junior wins over women ("U15 Girls" is a junior team),
// and anything without a junior or women marker is a men's (open) team.

export type TeamCategory = 'men' | 'women' | 'junior';

const TEAM_CATEGORIES: readonly TeamCategory[] = ['men', 'women', 'junior'];

export const TEAM_CATEGORY_LABELS: Record<TeamCategory, string> = {
  men: "Men's",
  women: "Women's",
  junior: 'Juniors',
};

function words(value: string | null | undefined): string[] {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

const JUNIOR_WORDS = new Set(['under', 'junior', 'juniors', 'girls', 'boys', 'youth', 'blast', 'kids']);
const WOMEN_WORDS = new Set(['women', 'womens', 'woman', 'ladies', 'female']);

function isJuniorName(value: string | null | undefined) {
  return words(value).some((word) => /^u\d{1,2}s?$/.test(word) || JUNIOR_WORDS.has(word));
}

function isWomenName(value: string | null | undefined) {
  return words(value).some((word) => WOMEN_WORDS.has(word));
}

/** Category from any names that describe the team (team, grade, competition). */
export function teamCategory(...names: Array<string | null | undefined>): TeamCategory {
  if (names.some(isJuniorName)) return 'junior';
  if (names.some(isWomenName)) return 'women';
  return 'men';
}

/** Junior age group ("Under 13s", "U13", "Boys U-13") or null. */
export function juniorAge(value: string | null | undefined): number | null {
  const list = words(value);
  for (let index = 0; index < list.length; index += 1) {
    const compact = list[index].match(/^u(\d{1,2})s?$/);
    if (compact) return Number(compact[1]);
    if ((list[index] === 'under' || list[index] === 'u') && /^\d{1,2}s?$/.test(list[index + 1] || '')) return Number.parseInt(list[index + 1], 10);
  }
  return null;
}

/** Items grouped in men's, women's, junior order; empty groups are kept. */
export function groupByCategory<T>(items: readonly T[], categoryOf: (item: T) => TeamCategory): Array<{ category: TeamCategory; label: string; items: T[] }> {
  return TEAM_CATEGORIES.map((category) => ({
    category,
    label: TEAM_CATEGORY_LABELS[category],
    items: items.filter((item) => categoryOf(item) === category),
  }));
}

/** "girls" or "boys" when a name marks a junior side's gender, otherwise null. */
export function juniorGender(value: string | null | undefined): 'girls' | 'boys' | null {
  const list = words(value);
  if (list.includes('girls') || list.includes('female')) return 'girls';
  if (list.includes('boys')) return 'boys';
  return null;
}

/** Same junior age group, and no conflicting boys/girls marker. */
export function sameJuniorSide(a: string | null | undefined, b: string | null | undefined, ageA = juniorAge(a)): boolean {
  if (ageA === null || juniorAge(b) !== ageA) return false;
  const genderA = juniorGender(a);
  const genderB = juniorGender(b);
  return !genderA || !genderB || genderA === genderB;
}
