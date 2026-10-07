// Venue names from published NDCC CMS events. Addresses checked 13 Sep 2026:
// NDCC: https://www.ndcc.com.au ; Sporties: https://leopoldsporties.com
// The Club Rooms are at Grinter Reserve (confirmed by the club, 7 Oct 2026).
// Never substitute the club ground for an unknown/ambiguous venue.
const GRINTER_RESERVE_NAMES = new Set(['grinter reserve', 'club rooms', 'club rooms, grinter reserve']);

export function eventVenue(location: string | null | undefined) {
  const name = location?.trim();
  const key = name?.toLowerCase();
  if (key && GRINTER_RESERVE_NAMES.has(key)) return {
    name, address: { '@type': 'PostalAddress', streetAddress: '141 Coppards Road',
      addressLocality: 'Moolap', addressRegion: 'VIC', postalCode: '3224', addressCountry: 'AU' },
  };
  if (key === 'leopold sporties') return {
    name, address: { '@type': 'PostalAddress', streetAddress: '135 Kensington Road',
      addressLocality: 'Leopold', addressRegion: 'VIC', postalCode: '3224', addressCountry: 'AU' },
  };
  return { name, address: undefined };
}
