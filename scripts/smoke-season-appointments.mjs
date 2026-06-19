const requiredNames = [
  'Craig Hillgrove',
  'Jason Robertson',
  'Daniel Harrison',
  'Kelsey Allan',
  'Aaron Morgan',
  'Anthony Quarrell',
  'Blake Ritchie',
  'Nathan Keevil',
  "Tyler O'Neil",
  'Rhys Bath',
  'Huey Neild',
  'Gautham Ranjith',
  'Caitlin-Rose Neil',
  'Freddie Norridge',
  'Skye Green',
  'Jodie Clark',
  'Elliot Ridway',
  'Harvey Cliff',
  'Scott Kirby',
];

const baseUrl = process.env.SEASON_APPOINTMENTS_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const endpoint = new URL('/api/public/season-appointments', baseUrl);
const response = await fetch(endpoint, { cache: 'no-store' });
const payload = await response.json().catch(() => null);

if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
  console.error(`Season appointments endpoint failed at ${endpoint}: ${response.status}`);
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

const names = payload.data.map((appointment) => appointment.name);
if (names.length !== requiredNames.length || names.some((name, index) => name !== requiredNames[index])) {
  console.error(`Expected ${requiredNames.length} active appointments in CMS order, received ${names.length}: ${names.join(', ')}`);
  process.exit(1);
}

console.log(`Verified ${names.length} runtime season appointments from ${endpoint}.`);
