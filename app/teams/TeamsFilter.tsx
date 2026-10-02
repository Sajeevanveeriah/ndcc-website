'use client';

import { useState, type ReactNode } from 'react';
import { TEAM_CATEGORY_LABELS, type TeamCategory } from '@/lib/playhq/team-category';

// Client island for /teams: the segmented All / Men's / Women's / Juniors
// filter. The team cards are rendered on the server and passed in per group,
// so every team stays in the server HTML; hidden groups use the `hidden`
// attribute rather than being removed. Logic is unit tested in
// scripts/test-teams-filter.cjs.

export type TeamFilterValue = 'all' | TeamCategory;

export type TeamFilterGroup = {
  category: TeamCategory;
  heading: string;
  count: number;
  content: ReactNode;
};

/** "All teams" plus one option per category that has at least one team. */
export function teamFilterOptions(groups: ReadonlyArray<Pick<TeamFilterGroup, 'category' | 'count'>>): Array<{ value: TeamFilterValue; label: string }> {
  return [
    { value: 'all', label: 'All teams' },
    ...groups.filter((group) => group.count > 0).map((group) => ({ value: group.category, label: TEAM_CATEGORY_LABELS[group.category] })),
  ];
}

export function isTeamGroupVisible(selected: TeamFilterValue, category: TeamCategory): boolean {
  return selected === 'all' || selected === category;
}

export default function TeamsFilter({ groups }: { groups: TeamFilterGroup[] }) {
  const [selected, setSelected] = useState<TeamFilterValue>('all');
  const populated = groups.filter((group) => group.count > 0);
  const options = teamFilterOptions(populated);
  // A filter with a single category would do nothing, so it is only shown
  // when there are at least two categories to choose between.
  const showFilter = options.length > 2;

  return (
    <>
      {showFilter && (
        <div className="mb-[22px]">
          <div className="nd-seg" role="group" aria-label="Filter teams by category">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected === option.value}
                aria-controls="team-groups"
                onClick={() => setSelected(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div id="team-groups" className="flex flex-col gap-9">
        {populated.map((group) => (
          <section
            key={group.category}
            aria-labelledby={`team-group-${group.category}`}
            hidden={!isTeamGroupVisible(selected, group.category)}
          >
            <h2 id={`team-group-${group.category}`} className="nd-month">{group.heading}</h2>
            {group.content}
          </section>
        ))}
      </div>
    </>
  );
}
