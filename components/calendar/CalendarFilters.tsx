'use client';

import { Search } from 'lucide-react';
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_EVENT_TYPE_COLOURS,
  CALENDAR_EVENT_TYPE_LABELS,
} from '@/lib/calendar/types';
import { cn } from '@/lib/utils';

type CalendarFiltersProps = {
  activeTypes: string[];
  onTypesChange: (types: string[]) => void;
  search: string;
  onSearchChange: (value: string) => void;
};

export default function CalendarFilters({ activeTypes, onTypesChange, search, onSearchChange }: CalendarFiltersProps) {
  const toggleType = (type: string) => {
    onTypesChange(
      activeTypes.includes(type) ? activeTypes.filter((value) => value !== type) : [...activeTypes, type]
    );
  };

  return (
    <div className="mb-4 space-y-3">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search events by title, location or details"
          aria-label="Search calendar events"
          className="w-full rounded-lg border border-edge-subtle bg-surface-card py-2 pl-9 pr-3 text-sm font-body text-content-primary placeholder:text-gray-400 focus:border-maroon-500 focus:outline-none focus:ring-2 focus:ring-maroon-500/30"
        />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by event type">
        <button
          type="button"
          onClick={() => onTypesChange([])}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-body font-semibold transition-colors border',
            activeTypes.length === 0
              ? 'bg-maroon-800 text-white border-maroon-800'
              : 'bg-surface-card text-content-muted border-edge-subtle hover:border-maroon-300'
          )}
          aria-pressed={activeTypes.length === 0}
        >
          All
        </button>
        {CALENDAR_EVENT_TYPES.map((type) => {
          const active = activeTypes.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-body font-semibold transition-colors border',
                active
                  ? 'text-white border-transparent'
                  : 'bg-surface-card text-content-muted border-edge-subtle hover:border-maroon-300'
              )}
              style={active ? { backgroundColor: CALENDAR_EVENT_TYPE_COLOURS[type] } : undefined}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: active ? '#ffffff' : CALENDAR_EVENT_TYPE_COLOURS[type] }}
                aria-hidden="true"
              />
              {CALENDAR_EVENT_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
