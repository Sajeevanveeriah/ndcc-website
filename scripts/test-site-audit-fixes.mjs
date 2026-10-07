// Fixes from the live site audit of 7 October 2026.
//
// Covers:
// 1. getPublicTeams() throws at runtime when the configured Supabase read
//    fails (ISR keeps the last good /teams and /teams/[slug] pages), keeps the
//    static fallback during `next build` and without Supabase env, and the
//    home stats strip hides only its Teams stat on a failure.
// 2. /pot-club and /privacy titles do not repeat the site name, use
//    pageMetadata (canonical) and are in the sitemap.
// 3. Section layouts keep the root title template so detail pages
//    (/events/[id], /news/[id], /gallery/[slug]) render "<title> | NDCC Dinos".
// 4. /calendar prev/next icons are hidden from assistive technology with a
//    labelled button, and other-month day numbers meet 4.5:1.
// 5. /about "No premierships recorded yet" meets 4.5:1 on club maroon.
// 6. Started/past event detail pages replace the registration form with a
//    plain closed/passed note.
// 7. /favicon.ico redirects permanently to the existing app icon.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import config from '../next.config.mjs';

let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}

const read = (file) => readFileSync(file, 'utf8');
const transpile = (file) => ts.transpileModule(read(file), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(file, imports, extra = {}) {
  const exports = {};
  vm.runInNewContext(transpile(file), {
    exports,
    console: { ...console, error: () => {} },
    Promise,
    Intl,
    Date,
    Number,
    Error,
    Map,
    URL,
    process: { env: extra.env ?? {} },
    require: (name) => {
      assert.ok(name in imports, `Unexpected import in ${file}: ${name}`);
      return imports[name];
    },
  });
  return exports;
}

// ------------------------------------------------------------------ colour
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
const globals = read('app/globals.css');
// Light and dark values of a space-separated RGB custom property (first and
// second definition in the theme blocks).
function themeRgb(name) {
  const matches = [...globals.matchAll(new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+);`, 'g'))];
  assert.ok(matches.length >= 2, `--${name} has light and dark values`);
  return { light: matches[0].slice(1, 4).map(Number), dark: matches[1].slice(1, 4).map(Number) };
}

// ------------------------------------------------------------------ 1. teams
const teamsState = { result: null, throws: null, building: false };
const buildModule = (env) => load('lib/public-teams.ts', {
  '@/lib/constants': { TEAMS: [] },
  '@/lib/supabase-server': {
    createServerClient: () => {
      const query = {
        select: () => query, eq: () => query, order: () => query,
        then: (resolve, reject) => (teamsState.throws ? Promise.reject(teamsState.throws) : Promise.resolve(teamsState.result)).then(resolve, reject),
      };
      return { from: () => query };
    },
  },
  '@/lib/types': {},
  '@/lib/public-link-url': { normalisePublicLinkUrl: (url) => url ?? null },
  '@/lib/playhq/team-view': { buildTeamSlugs: (teams) => teams.map((team) => ({ team, slug: team.name.toLowerCase().replace(/\W+/g, '-') })) },
  '@/lib/playhq/mapping-store': { loadTeamPlayHQLinks: async () => new Map() },
  '@/lib/server/build-phase': { isBuildPrerender: () => teamsState.building },
}, { env });
const configured = buildModule({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'x' });
const unconfigured = buildModule({});

await check('teams: a successful read returns the CMS teams', async () => {
  teamsState.result = { data: [{ name: 'First XI', playhq_url: null }], error: null };
  teamsState.throws = null;
  teamsState.building = false;
  const teams = await configured.getPublicTeams();
  assert.equal(teams.length, 1);
  assert.equal(teams[0].name, 'First XI');
});

await check('teams: a query error or thrown fetch at runtime throws instead of returning no teams', async () => {
  teamsState.building = false;
  teamsState.result = { data: null, error: { message: 'timeout' } };
  teamsState.throws = null;
  await assert.rejects(configured.getPublicTeams(), /Teams temporarily unavailable/);
  await assert.rejects(configured.getPublicTeamsWithSlugs(), /Teams temporarily unavailable/);
  await assert.rejects(configured.getPublicTeamBySlug('first-xi'), /Teams temporarily unavailable/, 'never a null (404) on failure');
  teamsState.throws = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
  await assert.rejects(configured.getPublicTeams(), /Teams temporarily unavailable/);
});

await check('teams: during next build a failed read keeps the static fallback so the build passes', async () => {
  teamsState.building = true;
  teamsState.result = { data: null, error: { message: 'unreachable' } };
  teamsState.throws = null;
  assert.deepEqual([...(await configured.getPublicTeams())], []);
  teamsState.throws = new Error('fetch failed');
  assert.deepEqual([...(await configured.getPublicTeams())], []);
  teamsState.building = false;
  teamsState.throws = null;
});

await check('teams: without Supabase env the static list is returned unchanged', async () => {
  teamsState.throws = new Error('must not query');
  assert.deepEqual([...(await unconfigured.getPublicTeams())], []);
  teamsState.throws = null;
});

await check('teams: callers do not swallow the failure into an empty list or 404', () => {
  const teamsPage = read('app/teams/(list)/page.tsx');
  assert.match(teamsPage, /const teams = await getPublicTeams\(\);/);
  assert.doesNotMatch(teamsPage, /getPublicTeams\(\)\.catch/);
  const slugPage = read('app/teams/[slug]/page.tsx');
  assert.doesNotMatch(slugPage, /getPublicTeam(?:s|BySlug|sWithSlugs)\([^)]*\)\.catch/);
  assert.match(read('components/home/PlayerSponsorsSection.tsx'), /isBuildPrerender\(\)/);
  assert.match(read('lib/public-teams.ts'), /if \(!isBuildPrerender\(\)\) \{[\s\S]*?throw new Error\('Teams temporarily unavailable'\)/);
});

await check('teams: the home stats strip hides only the Teams stat when the read fails', async () => {
  const stripState = { teams: async () => [{ name: 'A' }, { name: 'B' }] };
  const strip = load('components/home/HomeStatsStrip.tsx', {
    'react/jsx-runtime': jsx,
    '@/lib/public-teams': { getPublicTeams: () => stripState.teams() },
    '@/lib/structured-content': { getHistoryPremierships: async () => [{}, {}, {}] },
  });
  const ok = renderToStaticMarkup(await strip.default());
  assert.match(ok, /Teams/);
  stripState.teams = async () => { throw new Error('Teams temporarily unavailable'); };
  const degraded = renderToStaticMarkup(await strip.default());
  assert.doesNotMatch(degraded, /Teams/, 'no false team count');
  assert.match(degraded, /Premierships/, 'rest of the strip still renders');
});

// ------------------------------------------------------------------ 2/3. titles
const { pageMetadata, SITE_TITLE_TEMPLATE } = load('lib/seo.ts', {});

await check('titles: pageMetadata keeps the root template for nested routes', () => {
  assert.equal(SITE_TITLE_TEMPLATE, '%s | NDCC Dinos');
  const rootLayout = read('app/layout.tsx');
  assert.match(rootLayout, /template: '%s \| NDCC Dinos'/, 'same template as the root layout');
  const meta = pageMetadata('/news', 'Club news', 'Description');
  assert.equal(meta.title.default, 'Club news');
  assert.equal(meta.title.template, SITE_TITLE_TEMPLATE);
  assert.equal(meta.alternates.canonical, 'https://www.ndcc.com.au/news');
  assert.equal(meta.openGraph.title, 'Club news | NDCC Dinos');
});

// Minimal model of Next.js title resolution: a layout's string title resets
// the template its children receive; an object title passes its template on.
function resolveTitles(layers) {
  let template = null;
  let rendered = null;
  for (const title of layers) {
    const value = typeof title === 'string' ? title : title.default;
    rendered = template ? template.replace('%s', value) : value;
    template = typeof title === 'string' ? null : title.template ?? null;
  }
  return rendered;
}

await check('titles: event, news and gallery detail pages get exactly one site suffix', () => {
  const root = { default: 'Newcomb and District Cricket Club | NDCC Dinos', template: '%s | NDCC Dinos' };
  const newsLayout = pageMetadata('/news', 'Club news', 'x').title;
  assert.equal(resolveTitles([root, newsLayout, pageMetadata('/news/1', 'Dino Lotto Is Underway', 'x').title]), 'Dino Lotto Is Underway | NDCC Dinos');
  assert.equal(resolveTitles([root, newsLayout]), 'Club news | NDCC Dinos');
  for (const [file, title] of [['app/events/layout.tsx', 'Events'], ['app/gallery/layout.tsx', 'Gallery']]) {
    const source = read(file);
    assert.match(source, new RegExp(`title: \\{ default: '${title}', template: SITE_TITLE_TEMPLATE \\}`), `${file} re-declares the template`);
  }
  const eventsLayout = { default: 'Events', template: SITE_TITLE_TEMPLATE };
  assert.equal(resolveTitles([root, eventsLayout, pageMetadata('/events/1', 'Reverse Draw', 'x').title]), 'Reverse Draw | NDCC Dinos');
  assert.equal(resolveTitles([root, eventsLayout]), 'Events | NDCC Dinos');
  assert.match(read('app/events/[id]/page.tsx'), /pageMetadata\(`\/events\/\$\{event\.id\}`, event\.title,/);
  assert.match(read('app/news/[id]/page.tsx'), /pageMetadata\(`\/news\/\$\{post\.id\}`, post\.title,/);
});

await check('titles: Pot Club and Privacy use pageMetadata without repeating the site name', () => {
  const pot = read('app/pot-club/page.tsx');
  const privacy = read('app/privacy/page.tsx');
  assert.match(pot, /pageMetadata\('\/pot-club', 'Pot Club', 'Order your NDCC Pot Club engraved glass and pay online\.'\)/);
  assert.match(privacy, /pageMetadata\('\/privacy', 'Privacy', '[^']+'\)/);
  for (const source of [pot, privacy]) assert.doesNotMatch(source, /\| NDCC'/);
  const sitemap = read('lib/server/sitemap-entries.ts');
  assert.match(sitemap, /\$\{baseUrl\}\/pot-club`/);
  assert.match(sitemap, /\$\{baseUrl\}\/privacy`/);
});

// ------------------------------------------------------------------ 4. calendar
await check('calendar: prev/next icon spans are hidden and the button is labelled', () => {
  const view = read('components/calendar/FullCalendarView.tsx');
  assert.match(view, /buttonHints=\{\{ prev: 'Previous \$0', next: 'Next \$0' \}\}/);
  assert.match(view, /datesSet=\{\(\) => labelToolbarIcons\(rootRef\.current\)\}/);
  const { labelToolbarIcons } = load('components/calendar/label-toolbar-icons.ts', {});
  const attrs = (initial) => {
    const map = new Map(Object.entries(initial));
    return { getAttribute: (k) => map.get(k) ?? null, setAttribute: (k, v) => map.set(k, String(v)), removeAttribute: (k) => map.delete(k), map };
  };
  const icon = attrs({ role: 'img', class: 'fc-icon fc-icon-chevron-left' });
  const button = { ...attrs({ title: 'Previous month' }), querySelector: () => icon };
  const textButton = { ...attrs({ title: 'This month' }), querySelector: () => null };
  labelToolbarIcons({ querySelectorAll: () => [button, textButton] });
  assert.equal(icon.map.get('aria-hidden'), 'true');
  assert.equal(icon.map.has('role'), false);
  assert.equal(button.map.get('aria-label'), 'Previous month');
  assert.equal(textButton.map.has('aria-label'), false, 'text buttons keep their own name');
  labelToolbarIcons(null);
});

await check('calendar: other-month day numbers are muted but meet 4.5:1 in light and dark mode', () => {
  const css = read('components/calendar/calendar-theme.css');
  assert.match(css, /\n\.ndcc-calendar \.fc \.fc-day-other \.fc-daygrid-day-top \{\s*opacity: 1;/);
  assert.match(css, /\n\.ndcc-calendar \.fc \.fc-day-other \.fc-daygrid-day-number \{\s*color: rgb\(var\(--text-muted\)\);/);
  const muted = themeRgb('text-muted');
  const card = themeRgb('surface-card');
  assert.match(css, /--fc-page-bg-color: #ffffff;/);
  assert.ok(contrast(muted.light, [255, 255, 255]) >= 4.5, 'light mode');
  assert.ok(contrast(muted.dark, card.dark) >= 4.5, 'dark mode');
});

// ------------------------------------------------------------------ 5. about
await check('about: "No premierships recorded yet" meets 4.5:1 on club maroon', () => {
  const about = read('app/about/page.tsx');
  const line = about.split('\n').find((l) => l.includes('No premierships recorded yet.'));
  assert.ok(line);
  assert.match(line, /text-maroon-100/);
  assert.doesNotMatch(line, /text-white\/60/);
  const maroon100 = hex(globals.match(/--color-maroon-100: (#[0-9a-f]{6});/i)[1]);
  const surface = themeRgb('brand-maroon-surface');
  assert.ok(contrast(maroon100, surface.light) >= 4.5, 'light mode');
  assert.ok(contrast(maroon100, surface.dark) >= 4.5, 'dark mode');
});

// ------------------------------------------------------------------ 6. events
const { eventTiming, msUntilEventStart } = load('lib/events/event-timing.ts', {});

await check('events: timing uses the /events past-day rule and the API start rule', () => {
  const now = Date.parse('2026-10-07T02:00:00Z'); // 1pm, 7 Oct in Melbourne
  assert.equal(eventTiming('2026-10-03T09:00:00Z', now), 'passed', 'iPod Shuffle Night, 3 Oct');
  assert.equal(eventTiming('2026-10-06T12:30:00Z', now), 'passed', '11:30pm 6 Oct Melbourne is the previous club day');
  assert.equal(eventTiming('2026-10-07T00:00:00Z', now), 'started', 'earlier today');
  assert.equal(eventTiming('2026-10-07T08:00:00Z', now), 'open', 'later today');
  assert.equal(eventTiming('2026-11-01T08:00:00Z', now), 'open');
  assert.equal(eventTiming('not a date', now), 'started', 'matches the API: no valid start means closed');
  assert.equal(eventTiming(null, now), 'started');
  const api = read('app/api/events/route.ts');
  assert.match(api, /return !Number\.isFinite\(startsAt\) \|\| startsAt <= now;/, 'API rule unchanged');
});

await check('events: detail page shows a passed/closed note instead of the registration form', () => {
  const page = read('app/events/[id]/page.tsx');
  assert.match(page, /<EventDetailClient event=\{event\} initialTiming=\{eventTiming\(event\.date\)\} \/>/);
  const client = read('app/events/[id]/EventDetailClient.tsx');
  assert.match(client, /const update = \(\) => setTiming\(eventTiming\(event\.date\)\);\s*update\(\);/);
  // A page left open across the start time closes registration then too.
  assert.match(client, /const delay = msUntilEventStart\(event\.date\);/);
  assert.match(client, /const timer = setTimeout\(update, delay \+ 1000\);\s*return \(\) => clearTimeout\(timer\);/);
  assert.match(client, /\{timing !== 'open' && submitStatus === 'idle' \? \(/);
  assert.match(client, /timing === 'passed' \? 'This event has passed\.' : 'Registrations for this event have closed\.'/);
  const closedBranch = client.slice(client.indexOf("{timing !== 'open'"), client.indexOf(') : (', client.indexOf("{timing !== 'open'")));
  assert.doesNotMatch(closedBranch, /Register|<form|SnailPurchaseForm/);
});

await check('events: the open page is re-checked at the start time (within browser timer limits)', () => {
  const now = Date.parse('2026-10-07T02:00:00Z');
  assert.equal(msUntilEventStart('2026-10-07T08:00:00Z', now), 6 * 60 * 60 * 1000);
  assert.equal(msUntilEventStart('2026-10-07T00:00:00Z', now), null, 'already started');
  assert.equal(msUntilEventStart('2027-02-06T08:30:00Z', now), null, 'beyond the ~24.8-day timer limit');
  assert.equal(msUntilEventStart('not a date', now), null);
  assert.equal(msUntilEventStart(null, now), null);
});

// ------------------------------------------------------------------ 7. favicon
await check('favicon: /favicon.ico redirects permanently to the app icon', async () => {
  const redirects = await config.redirects();
  const favicon = redirects.find((r) => r.source === '/favicon.ico');
  assert.ok(favicon);
  assert.equal(favicon.destination, '/icon.jpg');
  assert.equal(favicon.permanent, true);
  readFileSync('app/icon.jpg');
});

console.log(`\n${checks} site audit fix checks passed`);
