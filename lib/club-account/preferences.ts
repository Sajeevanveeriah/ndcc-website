export const INTERESTS = {
  club_news: 'Club news and newsletters',
  senior_cricket: 'Senior cricket',
  junior_cricket: 'Junior cricket',
  womens_cricket: "Women's cricket",
  social_events: 'Social events',
  fundraising: 'Fundraising',
} as const;
export const VOLUNTEERING = {
  events: 'Events and BBQs',
  canteen: 'Kitchen and canteen',
  scoring: 'Scoring and match days',
  coaching: 'Coaching and junior support',
  grounds: 'Grounds and maintenance',
  sponsorship: 'Sponsorship and fundraising',
} as const;
export type MemberPreferences = {
  interests: Array<keyof typeof INTERESTS>;
  volunteering: Array<keyof typeof VOLUNTEERING>;
  email_updates: boolean;
};
export const emptyPreferences = (): MemberPreferences => ({ interests: [], volunteering: [], email_updates: false });
export function parsePreferences(value: Record<string, unknown>): MemberPreferences | null {
  const valid = (items: unknown, choices: object): items is string[] => Array.isArray(items)
    && items.length <= Object.keys(choices).length && items.every(item => typeof item === 'string' && Object.hasOwn(choices, item));
  if (!valid(value.interests, INTERESTS) || !valid(value.volunteering, VOLUNTEERING) || typeof value.email_updates !== 'boolean') return null;
  return {
    interests: [...new Set(value.interests)] as MemberPreferences['interests'],
    volunteering: [...new Set(value.volunteering)] as MemberPreferences['volunteering'],
    email_updates: value.email_updates,
  };
}
