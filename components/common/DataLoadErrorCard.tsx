import Link from 'next/link';
import Card, { CardContent } from '@/components/ui/Card';

type DataLoadErrorCardProps = {
  title: string;
  /** Full-page reload target so the server query genuinely re-runs. */
  retryHref: string;
  backHref?: string;
  backLabel?: string;
};

/**
 * Shown when a live data fetch failed (as opposed to succeeding with zero
 * rows, which gets its own honest "nothing published yet" state). Makes no
 * promise about timing beyond "usually temporary" and always offers a manual
 * retry.
 */
export default function DataLoadErrorCard({ title, retryHref, backHref, backLabel }: DataLoadErrorCardProps) {
  return (
    <Card>
      <CardContent className="p-8">
        <h2 className="text-xl font-display font-bold text-gray-900 mb-2">{title}</h2>
        <p className="font-body text-gray-700 mb-4">
          We couldn&apos;t load this just now. This is usually temporary - try refreshing in a minute.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href={retryHref} className="btn-primary">
            Try again
          </a>
          {backHref && (
            <Link href={backHref} className="btn-secondary">
              {backLabel || 'Go back'}
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
