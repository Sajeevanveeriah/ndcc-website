import Link from 'next/link';
import { FileText, Newspaper, ScrollText, Download } from 'lucide-react';
import SafeImage from '@/components/common/SafeImage';
import Badge from '@/components/ui/Badge';
import Card, { CardContent } from '@/components/ui/Card';
import { publicationTypeLabel, type PublicPublicationRecord } from '@/lib/public-publications';
import { formatDate, truncateText } from '@/lib/utils';

const TYPE_ICONS = {
  monthly_newsletter: Newspaper,
  weekly_newsletter: ScrollText,
  weekly_match_report: FileText,
} as const;

export default function PublicationCard({ publication }: { publication: PublicPublicationRecord }) {
  const Icon = TYPE_ICONS[publication.publication_type] ?? FileText;
  const summary = publication.summary || truncateText(publication.content, 140);
  return (
    <Card hover className="h-full">
      <Link
        href={`/publications/${publication.slug}`}
        className="flex h-full flex-col focus-ring"
        aria-label={`${publication.title} — ${publicationTypeLabel(publication.publication_type)}, ${formatDate(publication.issue_date)}`}
      >
        {publication.cover_image_url && (
          <div className="relative h-40 w-full overflow-hidden bg-surface-muted">
            <SafeImage
              src={publication.cover_image_url}
              alt=""
              fallback={null}
              fill
              sizes="(max-width: 640px) 100vw, 400px"
              className="object-cover"
            />
          </div>
        )}
        <CardContent className="flex flex-1 flex-col p-5">
          <div className="mb-2 flex items-center gap-2">
            <Icon className="h-4 w-4 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
            <Badge>{publicationTypeLabel(publication.publication_type)}</Badge>
            {publication.round_label && <Badge variant="info">{publication.round_label}</Badge>}
          </div>
          <h3 className="font-display text-lg font-bold text-content-primary group-hover:text-maroon-700 mb-1">
            {publication.title}
          </h3>
          <p className="text-xs font-body text-content-muted mb-2">
            {formatDate(publication.issue_date)}
            {publication.season_label ? ` · ${publication.season_label}` : ''}
          </p>
          {summary && <p className="text-sm font-body text-content-secondary">{summary}</p>}
          <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-sm font-semibold font-body text-maroon-700 underline underline-offset-4 decoration-maroon-300/70 dark:text-maroon-200">
            {publication.document_url ? (
              <>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Read &amp; download
              </>
            ) : (
              'Read more'
            )}
          </span>
        </CardContent>
      </Link>
    </Card>
  );
}
