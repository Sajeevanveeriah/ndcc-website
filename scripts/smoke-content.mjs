const baseUrl = (process.env.SMOKE_BASE_URL || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const checks = [
  { route: '/', label: 'home core content', all: ['Newcomb and District Cricket Club', '2026/27 Season Appointments', 'Aaron Morgan', 'Kelsey Allan', 'Scott Kirby', 'Our Sponsors'] },
  { route: '/', label: 'home season appointments recovery', any: ['Aaron Morgan', 'Anthony Quarrell', 'Blake Ritchie', 'Craig Hillgrove', 'Kelsey Allan', 'Nathan Keevil', 'Scott Kirby'], minAny: 7 },
  { route: '/about', label: 'about content', all: ['About the Dinos', 'Club Lineage', 'Premiership Honours'] },
  { route: '/fixtures', label: 'fixtures content', all: ['Fixtures', 'PlayHQ', '1st XI'] },
  { route: '/sponsors', label: 'sponsor cards', all: ['Champion Trophies', 'Phoenix', 'Blackman'] },
  { route: '/news', label: 'news fallback', all: ['Dinos celebrate senior and junior premiership success'] },
  { route: '/events', label: 'events fallback', all: ['Annual General Meeting'] },
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
    const anyMatches = (check.any || []).filter((needle) => html.includes(needle));
    const anyPass = !check.any || anyMatches.length >= (check.minAny || 1);
    const footerPass = html.includes('Wadawurrung');
    const footerImagePass = check.route !== '/' || html.includes('Connection_Bri_Hayes_Rev1.jpg');
    const ok = response.ok && allPass && anyPass && footerPass && footerImagePass;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.route} ${check.label} -> ${response.status}`);
    if (!ok) {
      if (!response.ok) console.log(`  status ${response.status}`);
      for (const needle of check.all || []) if (!html.includes(needle)) console.log(`  missing ${needle}`);
      if (check.any && !anyPass) console.log(`  matched ${anyMatches.length}/${check.minAny || 1}: ${anyMatches.join(', ') || 'none'}`);
      if (!footerPass) console.log('  missing footer Wadawurrung acknowledgement');
      if (!footerImagePass) console.log('  missing fallback footer acknowledgement image Connection_Bri_Hayes_Rev1.jpg');
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
