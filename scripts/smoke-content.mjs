const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const checks = [
  { route: '/', label: 'home signing', any: ['Aaron Morgan', 'Scott Kirby'] },
  { route: '/', label: 'home sponsors heading', all: ['Our Sponsors'] },
  { route: '/about', label: 'about hero', all: ['About the Dinos'] },
  { route: '/fixtures', label: 'fixtures PlayHQ team', all: ['PlayHQ', '1st XI'] },
  { route: '/sponsors', label: 'sponsor cards', all: ['Champion Trophies', 'Phoenix'] },
  { route: '/gallery', label: 'gallery fallback achievements', all: ['Under 13 Juniors', 'Division 4 First XI'] },
  { route: '/join', label: 'social membership', all: ['Social Membership', '$50.00'] },
  { route: '/contact', label: 'contact form', all: ['Send Us a Message'] },
];

let failed = 0;

for (const check of checks) {
  const url = `${baseUrl}${check.route}`;
  try {
    const response = await fetch(url);
    const html = await response.text();
    const allPass = (check.all || []).every((needle) => html.includes(needle));
    const anyPass = !check.any || check.any.some((needle) => html.includes(needle));
    const ok = response.ok && allPass && anyPass;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.route} ${check.label} -> ${response.status}`);
    if (!ok) {
      if (!response.ok) console.log(`  status ${response.status}`);
      for (const needle of check.all || []) if (!html.includes(needle)) console.log(`  missing ${needle}`);
      if (check.any && !anyPass) console.log(`  missing any of ${check.any.join(' / ')}`);
      failed += 1;
    }
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${check.route} ${check.label} -> ${error instanceof Error ? error.message : 'request failed'}`);
  }
}

if (failed > 0) {
  console.error(`Content smoke check failed for ${failed} check(s).`);
  process.exit(1);
}

console.log(`Content smoke check passed for ${checks.length} check(s).`);
