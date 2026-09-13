type Row = Record<string, unknown>;
type DetailRows = { news: Row[]; events: Row[]; publications: Row[]; albums: Row[] };

export function visibleAt(row: Row, now: Date, scheduled: boolean) {
  if (row.published !== true) return false;
  if (!scheduled || row.published_at == null) return true;
  const time = Date.parse(String(row.published_at));
  return Number.isFinite(time) && time <= now.getTime();
}

export function buildDetailEntries(baseUrl: string, rows: DetailRows, now: Date) {
  const entries: Array<{ url: string; lastModified?: Date }> = [];
  for (const [family, records, scheduled] of [
    ['news', rows.news, true], ['events', rows.events, false],
    ['publications', rows.publications, true], ['gallery', rows.albums, false],
  ] as const) {
    for (const row of records) {
      if (!visibleAt(row, now, scheduled)) continue;
      if (family === 'news' && String(row.title).trim().toLowerCase() === 'test article') continue;
      const key = family === 'gallery' || family === 'publications' ? row.slug : row.id;
      if (typeof key !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) continue;
      const entry: { url: string; lastModified?: Date } = { url: `${baseUrl.replace(/\/$/, '')}/${family}/${key}` };
      // News/events have no update field. Album image changes need not update
      // the album row. Omit lastmod for those families rather than imply freshness.
      if (family === 'publications' && row.updated_at) {
        const time = Date.parse(String(row.updated_at));
        if (Number.isFinite(time) && time <= now.getTime()) entry.lastModified = new Date(time);
      }
      entries.push(entry);
    }
  }
  return entries;
}
