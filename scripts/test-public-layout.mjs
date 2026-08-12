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

console.log('Public layout contract checks passed.');
