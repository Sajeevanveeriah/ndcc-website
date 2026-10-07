// Meta descriptions for /publications and /publications/[slug]. Pure (no
// server-only imports) so scripts/test-site-audit-fixes-2.mjs can load it.
//
// Every description is built only from the publication record itself (its
// summary, title, type, issue date, round/season labels and body text), so
// two issues never share a description and nothing is invented.

const DESCRIPTION_MAX = 160;

export type PublicationSeoFields = {
  title: string;
  summary: string | null;
  content: string | null;
  issue_date: string;
  round_label: string | null;
  season_label: string | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max = DESCRIPTION_MAX): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 3);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, '')}...`;
}

/** "7 October 2026" in the club's time zone, or null for an unusable date. */
export function publicationIssueDate(value: string): string | null {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * The record's own summary when it has one; otherwise its title, type, issue
 * date and labels, followed by the start of its body text when there is any.
 */
export function publicationDescription(publication: PublicationSeoFields, typeLabel: string): string {
  const summary = clean(publication.summary);
  if (summary) return truncate(summary);
  const title = clean(publication.title);
  const date = publicationIssueDate(publication.issue_date);
  const labels = [clean(publication.round_label), clean(publication.season_label)].filter(Boolean);
  const head = `${title}: ${typeLabel} from Newcomb and District Cricket Club${date ? `, issued ${date}` : ''}${labels.length ? ` (${labels.join(', ')})` : ''}.`;
  const body = clean(publication.content);
  return truncate(body ? `${head} ${body}` : head);
}

/**
 * /publications filter views (?type=) are distinct, self-canonical lists, so
 * each names its filter (and page) instead of reusing the archive text.
 */
export function publicationsArchiveDescription(typeLabel: string | null, page: number): string {
  const base = typeLabel
    ? `${typeLabel} archive of Newcomb and District Cricket Club, newest issue first.`
    : 'Read NDCC newsletters and match reports, with published club news and downloadable issues.';
  return page > 1 ? `${base} Page ${page}.` : base;
}
