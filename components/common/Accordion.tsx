'use client';

import { useId, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AccordionItem = {
  id: string;
  question: string;
  answer: ReactNode;
};

// Accessible single-open accordion: real <button> triggers with
// aria-expanded/aria-controls, labelled regions, a plus icon that rotates
// into an X, and CSS grid-row height animation (0fr -> 1fr) that the global
// reduced-motion rule neutralises automatically.
export default function Accordion({ items, className }: { items: AccordionItem[]; className?: string }) {
  const baseId = useId();
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className={cn('divide-y divide-edge-subtle rounded-2xl border border-edge-subtle bg-surface-card', className)}>
      {items.map((item) => {
        const open = openId === item.id;
        const headerId = `${baseId}-${item.id}-header`;
        const panelId = `${baseId}-${item.id}-panel`;
        return (
          <div key={item.id}>
            <h3>
              <button
                type="button"
                id={headerId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : item.id)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-display text-lg font-semibold text-content-primary transition-colors hover:text-maroon-700 focus-ring dark:hover:text-maroon-200"
              >
                <span>{item.question}</span>
                <Plus
                  aria-hidden="true"
                  className={cn(
                    'h-5 w-5 shrink-0 text-maroon-700 transition-transform duration-300 dark:text-maroon-200',
                    open && 'rotate-45'
                  )}
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              className="grid transition-[grid-template-rows] duration-300 ease-out"
              style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-5 font-body text-content-secondary">{item.answer}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
