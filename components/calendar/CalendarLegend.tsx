import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_EVENT_TYPE_COLOURS,
  CALENDAR_EVENT_TYPE_LABELS,
} from '@/lib/calendar/types';
import { cn } from '@/lib/utils';

export default function CalendarLegend({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-gray-100 bg-white p-4', className)}>
      <h3 className="text-xs font-body font-semibold uppercase tracking-[0.08em] text-maroon-800 mb-3">
        Event categories
      </h3>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {CALENDAR_EVENT_TYPES.map((type) => (
          <li key={type} className="inline-flex items-center gap-2 text-sm font-body text-gray-600">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: CALENDAR_EVENT_TYPE_COLOURS[type] }}
              aria-hidden="true"
            />
            {CALENDAR_EVENT_TYPE_LABELS[type]}
          </li>
        ))}
        <li className="inline-flex items-center gap-2 text-sm font-body text-gray-600">
          <span className="h-3 w-3 rounded-sm ring-2 ring-gold-400 bg-white" aria-hidden="true" />
          Featured
        </li>
        <li className="inline-flex items-center gap-2 text-sm font-body text-gray-600">
          <span className="h-3 w-3 rounded-sm bg-gray-400" aria-hidden="true" />
          Cancelled / postponed
        </li>
      </ul>
    </div>
  );
}
