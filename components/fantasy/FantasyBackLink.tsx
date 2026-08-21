import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Standard "back to the fantasy hub" affordance, placed directly under the
 * page hero on every fantasy sub-page. Pass className to adjust spacing.
 */
export default function FantasyBackLink({ className }: { className?: string }) {
  return (
    <div className={className ?? 'mb-8'}>
      <Link
        href="/fantasy"
        className="inline-flex items-center rounded text-maroon-700 dark:text-maroon-200 hover:underline font-body font-semibold focus-ring"
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
        Back to Dino Coach
      </Link>
    </div>
  );
}
