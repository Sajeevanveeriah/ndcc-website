const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const routes = [
  ['/', [200]],
  ['/about', [200]],
  ['/contact', [200]],
  ['/join', [200]],
  ['/facilities', [200]],
  ['/fixtures', [200]],
  ['/news', [200]],
  ['/events', [200]],
  ['/sponsors', [200]],
  ['/gallery', [200]],
  ['/teams', [200]],
  ['/kitchen', [200]],
  ['/merchandise', [200]],
  ['/volunteer', [200]],
  ['/fantasy', [200]],
  ['/fantasy/rules', [200]],
  ['/fantasy/register', [200]],
  ['/fantasy/login', [200]],
  ['/fantasy/account', [200]],
  ['/fantasy/leaderboard', [200]],
  ['/fantasy/players', [200]],
  ['/fantasy/manager-leaderboard', [200]],
  ['/admin/login', [200]],
  ['/admin', [200, 302, 307]],
  ['/admin/content', [200, 302, 307]],
  ['/admin/content-blocks', [200, 302, 307]],
  ['/admin/site-pages', [200, 302, 307]],
  ['/admin/club-details', [200, 302, 307]],
  ['/admin/club-settings', [200, 302, 307]],
  ['/admin/news', [200, 302, 307]],
  ['/admin/events', [200, 302, 307]],
  ['/admin/sponsors', [200, 302, 307]],
  ['/admin/gallery', [200, 302, 307]],
  ['/admin/teams', [200, 302, 307]],
  ['/admin/season-appointments', [200, 302, 307]],
  ['/admin/kitchen', [200, 302, 307]],
  ['/admin/apparel', [200, 302, 307]],
  ['/admin/history', [200, 302, 307]],
  ['/admin/minutes', [200, 302, 307]],
  ['/admin/memberships', [200, 302, 307]],
  ['/admin/volunteers', [200, 302, 307]],
  ['/admin/fantasy', [200, 302, 307]],
  ['/admin/fantasy/settings', [200, 302, 307]],
  ['/admin/fantasy/players', [200, 302, 307]],
  ['/admin/fantasy/rounds', [200, 302, 307]],
  ['/admin/fantasy/scoring', [200, 302, 307]],
  ['/admin/fantasy/scores', [200, 302, 307]],
  ['/admin/email-diagnostics', [200, 302, 307]],
];

let failed = 0;

for (const [route, expected] of routes) {
  const url = `${baseUrl}${route}`;
  try {
    const response = await fetch(url, { redirect: 'manual' });
    const ok = expected.includes(response.status);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${route} -> ${response.status} (expected ${expected.join('/')})`);
    if (!ok) failed += 1;
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${route} -> ${error instanceof Error ? error.message : 'request failed'}`);
  }
}

if (failed > 0) {
  console.error(`Smoke route check failed for ${failed} route(s).`);
  process.exit(1);
}

console.log(`Smoke route check passed for ${routes.length} route(s).`);
