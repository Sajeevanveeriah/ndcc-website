import { createClient } from '@supabase/supabase-js';

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from('season_appointments')
  .select('id,name,role,image_url,announcement_date,sort_order,is_active')
  .eq('is_active', true)
  .order('sort_order', { ascending: true })
  .order('announcement_date', { ascending: false })
  .order('name', { ascending: true });

if (error) {
  console.error(error.message);
  process.exit(1);
}

const names = (data ?? []).map((appointment) => appointment.name);
console.log(JSON.stringify(data, null, 2));

if (names.length !== requiredNames.length || names.some((name, index) => name !== requiredNames[index])) {
  console.error(`Expected ${requiredNames.length} active appointments in CMS order, received ${names.length}: ${names.join(', ')}`);
  process.exit(1);
}

console.log(`Verified ${names.length} active season appointments in CMS order.`);
