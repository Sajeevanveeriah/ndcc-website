import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FACILITY_BOOKING_LINK } from '../lib/public-links.ts';

assert.deepEqual(
  FACILITY_BOOKING_LINK,
  {
    href: 'https://docs.google.com/forms/d/e/1FAIpQLScR4QEPmmzozezpWhk6x1M90b4x0k4WIzYx5bDdSBVwe0I9pQ/viewform?usp=header',
    label: 'Book Facilities',
    target: '_blank',
    rel: 'noopener noreferrer',
  },
  'The facilities booking CTA must retain its public URL and safe external-link contract.',
);

const facilitiesPage = await readFile(new URL('../app/facilities/page.tsx', import.meta.url), 'utf8');
assert.match(facilitiesPage, /href=\{FACILITY_BOOKING_LINK\.href\}/, 'Facilities page must render the booking URL.');
assert.match(facilitiesPage, /\{FACILITY_BOOKING_LINK\.label\}/, 'Facilities page must render the booking label.');

const sponsorsPage = await readFile(new URL('../app/sponsors/page.tsx', import.meta.url), 'utf8');
assert.match(
  sponsorsPage,
  /aria-label="Current sponsors by tier"/,
  'Sponsor tiers must share one compact, accessible section.',
);
assert.match(
  sponsorsPage,
  /data-sponsor-tier=\{tier\.value\}/,
  'Each sponsor tier must remain identifiable in the combined section.',
);
assert.match(
  sponsorsPage,
  /xl:grid-cols-5/,
  'The largest sponsor tier must use the denser desktop grid.',
);
assert.doesNotMatch(
  sponsorsPage,
  /<section className="band-maroon section-padding">/,
  'The sponsor page must not repeat the enquiry CTA before the packages and form.',
);

console.log('Public layout contract checks passed.');
