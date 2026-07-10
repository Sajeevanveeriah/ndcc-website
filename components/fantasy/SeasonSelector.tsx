'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type SeasonOption = {
  id: string;
  slug: string;
  name: string;
  statusLabel: string;
  isCurrent: boolean;
};

// Shared public/CMS fantasy season dropdown. The selection lives in the
// ?season= query param so views are shareable; changing season drops
// view-specific params (like ?round=) that belong to the previous season.
export default function SeasonSelector({ seasons, selectedSlug, label = 'Season' }: { seasons: SeasonOption[]; selectedSlug: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = useCallback(
    (slug: string) => {
      const params = new URLSearchParams(searchParams?.toString() || '');
      params.delete('round');
      const target = seasons.find((season) => season.slug === slug);
      if (target?.isCurrent) params.delete('season');
      else params.set('season', slug);
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [router, pathname, searchParams, seasons],
  );

  if (seasons.length <= 1) return null;

  return (
    <label className="inline-flex items-center gap-2 font-body text-sm text-gray-700">
      <span className="font-semibold">{label}</span>
      <select
        value={selectedSlug}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-maroon-300 bg-white px-3 py-2 text-sm font-body text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-maroon-600"
        aria-label="Choose fantasy season"
      >
        {seasons.map((season) => (
          <option key={season.id} value={season.slug}>
            {season.name} · {season.statusLabel}{season.isCurrent ? ' (current)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
