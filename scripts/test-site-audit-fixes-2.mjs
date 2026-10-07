// Fixes from the second live site audit (7 October 2026).
//
// Covers:
// 1. Soft 404s. A loading.tsx boundary above a route makes Next.js stream the
//    page shell (HTTP 200) before the route can call notFound(), so unknown
//    /news/<id>, /events/<id>, /teams/<slug>, /gallery/<slug> and
//    /publications/<slug> URLs answered 200 with the not-found page. No
//    server page or layout that calls notFound() may sit under a loading.tsx;
//    listing pages keep their skeleton inside a (list) route group (same
//    URLs). The root layout no longer emits "index, follow" next to the
//    not-found page's "noindex".
// 2. Meta descriptions. Publication detail pages without a summary get a
//    description built from their own title, type, issue date, labels and
//    body; /publications?type= and /winners?category= views (self-canonical)
//    name their filter.
// 3. Social images. The default og:image is a 1200x630 letterbox of the club
//    logo (public/images/og-default.jpg, generated from public/images/logo.jpg
//    with sharp: resize 1200x630 fit "contain" on #ffffff, mozjpeg q82), and
//    Supabase Storage originals are served to previews through the Next image
//    optimiser at 1200px.
// A. /calendar prev/next icons are labelled on the first render, not only
//    after datesSet (MutationObserver + next frame after mount).
// B. shortTeamLabel strips the club prefix only when all of it matches
//    ("Newcomb & Dist/Geel City U17" no longer becomes "& Dist/...").
// C. The scrolled header is opaque enough for the muted tagline to keep
//    4.5:1 over any section, in both themes.
// D. No page title carries a manual " | NDCC" before the template suffix.
// E. The home page hero fallback emits no second <h1 id="home-title">.
// F. Dino Coach sign-in, squad and transfers pages are noindex, follow.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import sharp from 'sharp';
import nextConfig from '../next.config.mjs';
import { pageMetadata, socialImageUrl, DEFAULT_OG_IMAGE, SITE_URL, SOCIAL_IMAGE_WIDTH } from '../lib/seo.ts';
import { publicationDescription, publicationsArchiveDescription } from '../lib/publication-seo.ts';

let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}
const read = (file) => readFileSync(file, 'utf8');
function load(file, imports = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      if (name in imports) return imports[name];
      throw new Error(`unexpected import ${name}`);
    },
    ...globals,
  });
  return exports;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------- 1. 404s
await check('no server page/layout that calls notFound() sits under a loading.tsx boundary', () => {
  const offenders = [];
  let inspected = 0;
  for (const file of walk('app')) {
    const base = path.basename(file);
    if (base !== 'page.tsx' && base !== 'layout.tsx') continue;
    const source = read(file);
    if (/^\s*['"]use client['"]/.test(source) || !/\bnotFound\(\)/.test(source)) continue;
    inspected++;
    // A segment's loading.tsx wraps its page but not its own layout.
    let dir = base === 'page.tsx' ? path.dirname(file) : path.dirname(path.dirname(file));
    for (;;) {
      if (existsSync(path.join(dir, 'loading.tsx'))) offenders.push(`${file} (under ${path.join(dir, 'loading.tsx')})`);
      if (dir === 'app' || dir === '.' || dir === path.dirname(dir)) break;
      dir = path.dirname(dir);
    }
  }
  assert.ok(inspected >= 10, `expected the notFound() routes to be found (got ${inspected})`);
  assert.deepEqual(offenders, [], 'routes that call notFound() must not stream under a loading boundary');
});

await check('detail routes stay at their URLs and outside the listing loading boundaries', () => {
  assert.equal(existsSync('app/loading.tsx'), false, 'no root loading boundary');
  for (const [section, param] of [['news', '[id]'], ['events', '[id]'], ['gallery', '[slug]'], ['teams', '[slug]'], ['publications', '[slug]']]) {
    assert.ok(existsSync(`app/${section}/${param}/page.tsx`), `${section} detail route unchanged`);
    assert.equal(existsSync(`app/${section}/loading.tsx`), false, `${section} has no section-wide loading boundary`);
  }
  for (const section of ['news', 'events', 'gallery', 'teams', 'sponsors']) {
    assert.ok(existsSync(`app/${section}/(list)/page.tsx`), `${section} listing page in the (list) route group`);
    assert.ok(existsSync(`app/${section}/(list)/loading.tsx`), `${section} listing keeps its loading skeleton`);
    assert.equal(existsSync(`app/${section}/page.tsx`), false, `${section} has one listing page only`);
  }
  assert.ok(existsSync('app/publications/page.tsx'), '/publications listing unchanged');
  // Routes that used only the root skeleton keep one of their own.
  for (const segment of ['calendar', 'club-account', 'committee', 'committee-calendar', 'pay-balance', 'payment', 'player-registration', 'player-sponsors', 'pot-club', 'privacy', 'this-week']) {
    assert.match(read(`app/${segment}/loading.tsx`), /RouteSkeleton/, `${segment} keeps the route skeleton`);
  }
});

await check('root layout leaves robots to the default so 404s carry only noindex', () => {
  const layout = read('app/layout.tsx');
  assert.doesNotMatch(layout, /robots:\s*\{\s*index:\s*true/);
});

// ------------------------------------------------------ 2. descriptions
const newsletter = (n, extra = {}) => ({
  title: `Dinos Monthly - Issue ${n}`,
  summary: null,
  content: '',
  issue_date: `2026-0${n}-01`,
  round_label: null,
  season_label: '2025/26',
  ...extra,
});

await check('publication detail descriptions come from each record and are unique', () => {
  const records = [1, 2, 3, 4].map((n) => newsletter(n));
  const descriptions = records.map((record) => publicationDescription(record, 'Monthly Newsletter'));
  assert.equal(new Set(descriptions).size, records.length, 'four newsletters, four descriptions');
  for (const [i, description] of descriptions.entries()) {
    assert.ok(description.includes(records[i].title), 'names its own title');
    assert.ok(description.length <= 160, 'fits a meta description');
    assert.notEqual(description, 'Monthly Newsletter from Newcomb and District Cricket Club.');
  }
  assert.match(descriptions[0], /issued 1 January 2026/);
  assert.match(descriptions[0], /\(2025\/26\)/);

  assert.equal(publicationDescription(newsletter(5, { summary: '  Round  wrap  ' }), 'Monthly Newsletter'), 'Round wrap', 'summary wins');
  const withBody = publicationDescription(newsletter(6, { content: 'Welcome back to the season. '.repeat(20) }), 'Monthly Newsletter');
  assert.ok(withBody.startsWith('Dinos Monthly - Issue 6: Monthly Newsletter'), withBody);
  assert.ok(withBody.includes('Welcome back'), 'adds the start of the body');
  assert.ok(withBody.length <= 160 && withBody.endsWith('...'), withBody);
  assert.ok(!publicationDescription(newsletter(7, { issue_date: 'not a date' }), 'Match Report').includes('Invalid'), 'bad dates are omitted');

  const detail = read('app/publications/[slug]/page.tsx');
  assert.match(detail, /publicationDescription\(publication, publicationTypeLabel\(publication\.publication_type\)\)/);
  assert.doesNotMatch(detail, /from Newcomb and District Cricket Club\.`/, 'no shared per-type fallback');
});

await check('/publications and /winners filter views name their filter', () => {
  const all = publicationsArchiveDescription(null, 1);
  const types = ['Monthly Newsletter', 'Weekly Newsletter', 'Match Report'].map((label) => publicationsArchiveDescription(label, 1));
  assert.equal(new Set([all, ...types]).size, 4);
  assert.match(types[0], /^Monthly Newsletter archive/);
  assert.notEqual(publicationsArchiveDescription('Match Report', 2), types[2], 'pages differ');
  assert.match(publicationsArchiveDescription('Match Report', 2), /Page 2\.$/);
  const archive = read('app/publications/page.tsx');
  assert.match(archive, /publicationsArchiveDescription\(type \? publicationTypeLabel\(type\) : null, page\)/);
  // Unknown parameters (e.g. ?category=) are not in the canonical.
  assert.match(archive, /if \(type\) params\.set\('type', type\);/);
  assert.doesNotMatch(archive, /params\.set\('category'/);
  const winners = read('app/winners/page.tsx');
  assert.match(winners, /`\$\{WINNER_CATEGORY_LABELS\[category\]\} winners at Newcomb & District Cricket Club\.`/);
});

// ----------------------------------------------------- 3. social images
await check('default og:image is a small 1200x630 derivative of the logo', async () => {
  const file = 'public/images/og-default.jpg';
  const size = statSync(file).size;
  assert.ok(size < 150 * 1024, `og-default.jpg is ${size} bytes`);
  const meta = await sharp(file).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
  assert.equal(DEFAULT_OG_IMAGE.url, '/images/og-default.jpg');
  assert.deepEqual([DEFAULT_OG_IMAGE.width, DEFAULT_OG_IMAGE.height], [1200, 630]);
  // Letterbox: the side bars are the logo's own white background.
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  for (const x of [2, 1197]) {
    const i = (315 * info.width + x) * info.channels;
    assert.ok(data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245, `side bar at x=${x} is white`);
  }
  assert.ok(existsSync('public/images/logo.jpg'), 'source logo kept for the navbar, footer and receipts');

  const meta2 = pageMetadata('/about', 'About', 'About the club.');
  assert.equal(meta2.openGraph.images[0].url, `${SITE_URL}/images/og-default.jpg`);
  assert.equal(meta2.openGraph.images[0].width, 1200);
  assert.equal(meta2.twitter.images[0].url, `${SITE_URL}/images/og-default.jpg`);
  const layout = read('app/layout.tsx');
  assert.match(layout, /images: \[\{ \.\.\.DEFAULT_OG_IMAGE, alt: 'NDCC Logo' \}\]/);
  assert.doesNotMatch(read('app/news/[id]/page.tsx'), /url: '\/images\/logo\.jpg', alt/);
});

await check('Supabase originals are previewed through the image optimiser at 1200px', () => {
  const original = 'https://alduwuipmmnzorcgkcli.supabase.co/storage/v1/object/public/gallery/albums/a b/IMG_1.JPG';
  const resized = socialImageUrl(original);
  assert.equal(resized, `${SITE_URL}/_next/image?url=${encodeURIComponent(new URL(original).href)}&w=1200&q=75`);
  assert.equal(socialImageUrl('/images/about-hero.webp'), `${SITE_URL}/images/about-hero.webp`, 'local files stay direct');
  assert.equal(socialImageUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg', 'hosts the optimiser does not allow stay direct');

  // The optimiser must accept the URL: allowed host and an allowed width.
  const images = nextConfig.images;
  assert.ok(images.remotePatterns.some((p) => p.hostname === 'alduwuipmmnzorcgkcli.supabase.co' && !p.pathname));
  assert.equal(images.unoptimized, false);
  const widths = [...(images.deviceSizes ?? [640, 750, 828, 1080, 1200, 1920, 2048, 3840]), ...(images.imageSizes ?? [16, 32, 48, 64, 96, 128, 256, 384])];
  assert.ok(widths.includes(SOCIAL_IMAGE_WIDTH), 'w=1200 is an allowed optimiser width');

  const album = pageMetadata('/gallery/x', 'Album', 'Album.', original);
  assert.equal(album.openGraph.images[0].url, resized);
  assert.equal(album.twitter.images[0].url, resized);
  // Gallery albums and publications use pageMetadata's images, not raw URLs.
  assert.match(read('app/gallery/[slug]/page.tsx'), /pageMetadata\(`\/gallery\/\$\{detail\.album\.slug\}`/);
  assert.doesNotMatch(read('app/publications/[slug]/page.tsx'), /images: \[\{ url: publication\.cover_image_url \}\]/);
  assert.match(read('app/news/[id]/page.tsx'), /socialImageUrl\(image\.url\)/);
});

// ------------------------------------------------- A. calendar icons
await check('calendar toolbar icons are labelled on first render', () => {
  const view = read('components/calendar/FullCalendarView.tsx');
  assert.match(view, /useEffect\(\(\) => observeToolbarIcons\(rootRef\.current\), \[\]\)/);
  assert.match(view, /datesSet=\{\(\) => labelToolbarIcons\(rootRef\.current\)\}/, 'still relabels after view changes');

  const makeButton = (title) => {
    const attrs = { title };
    const icon = { attrs: { role: 'img' }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
    return { attrs, icon, querySelector: () => icon, getAttribute: (k) => attrs[k] ?? null, setAttribute(k, v) { attrs[k] = v; } };
  };
  const buttons = [makeButton('Previous month'), makeButton('Next month')];
  const root = { querySelectorAll: () => buttons };
  let observed = null;
  let observerCallback = null;
  let frame = null;
  class FakeObserver {
    constructor(cb) { observerCallback = cb; }
    observe(target, options) { observed = { target, options }; }
    disconnect() { observed = 'disconnected'; }
  }
  const { observeToolbarIcons } = load('components/calendar/label-toolbar-icons.ts', {}, {
    MutationObserver: FakeObserver,
    requestAnimationFrame: (cb) => { frame = cb; return 1; },
    cancelAnimationFrame: () => { frame = null; },
  });
  const stop = observeToolbarIcons(root);
  // Labelled synchronously on mount.
  for (const b of buttons) {
    assert.equal(b.attrs['aria-label'], b.attrs.title);
    assert.equal(b.icon.attrs['aria-hidden'], 'true');
    assert.equal(b.icon.attrs.role, undefined);
  }
  assert.equal(observed.target, root);
  assert.deepEqual(JSON.parse(JSON.stringify(observed.options)), { childList: true, subtree: true, attributes: true, attributeFilter: ['title', 'role'] });
  // FullCalendar re-renders the toolbar after mount: the observer relabels.
  buttons[0].icon.attrs.role = 'img';
  buttons[0].attrs.title = 'Previous week';
  observerCallback([]);
  assert.equal(buttons[0].attrs['aria-label'], 'Previous week');
  assert.equal(buttons[0].icon.attrs.role, undefined);
  assert.equal(typeof frame, 'function', 'labels again on the next frame');
  stop();
  assert.equal(observed, 'disconnected');
  assert.doesNotThrow(() => observeToolbarIcons(null)());
});

// --------------------------------------------- B. short PlayHQ labels
await check('shortTeamLabel strips the club prefix only when all of it matches', () => {
  const seasonMatch = load('lib/playhq/season-match.ts');
  const teamCategory = load('lib/playhq/team-category.ts');
  const view = load('lib/playhq/team-view.ts', { './season-match': seasonMatch, './team-category': teamCategory, './team-slug': {} });
  const cases = [
    ['Newcomb & Dist/Geel City U17', 'Newcomb & Dist/Geel City U17'],
    ['Newcomb & Dist U17', 'U17'],
    ['Newcomb & Dist. U15 Girls', 'U15 Girls'],
    ['Newcomb and Dist 3rds', '3rds'],
    ['Newcomb & District Women 1sts', 'Women 1sts'],
    ['Newcomb and District Cricket Club 2nds', '2nds'],
    ['Newcomb&District U13', 'U13'],
    ['Newcomb 4ths', '4ths'],
    ['NDCC Under 11', 'Under 11'],
    ['Newcomb & District', 'Newcomb & District'],
    ['Guild St. Marys', 'Guild St. Marys'],
  ];
  for (const [name, expected] of cases) {
    const label = view.shortTeamLabel(name);
    assert.equal(label, expected, name);
    assert.doesNotMatch(label, /^\s*(&|and\b|\/)/i, `${name} never starts with "&"`);
  }
});

// ------------------------------------------------ C. header contrast
await check('scrolled header keeps the tagline at >= 4.5:1 over any section', () => {
  const navbar = read('components/layout/Navbar.tsx');
  assert.match(navbar, /text-content-muted sm:block">Cricket Club · The Dinos</);
  const opacity = Number(navbar.match(/scrolled\s*\?\s*'[^']*bg-surface-nav\/(\d+)/)?.[1]) / 100;
  assert.ok(opacity > 0 && opacity < 1, 'scrolled header stays slightly translucent');
  const css = read('app/globals.css');
  const token = (block, name) => css.slice(css.indexOf(block)).match(new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+)`)).slice(1).map(Number);
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // Extremes any section can put under the header: black, white, maroons.
  const under = [[0, 0, 0], [255, 255, 255], [136, 0, 0], [96, 0, 0], [74, 0, 0], [201, 48, 48]];
  for (const block of ['  :root {', '  .dark {']) {
    const nav = token(block, 'surface-nav');
    const muted = token(block, 'text-muted');
    const worst = Math.min(...under.map((u) => ratio(muted, nav.map((n, i) => opacity * n + (1 - opacity) * u[i]))));
    assert.ok(worst >= 4.5, `${block.trim()} tagline worst case ${worst.toFixed(2)}:1`);
  }
});

// ------------------------------------------------- D. title suffixes
await check('no page title adds its own " | NDCC" suffix', () => {
  const offenders = walk('app')
    .filter((file) => /\.(tsx?|mjs)$/.test(file))
    .filter((file) => /title\s*:\s*['"`][^'"`]*\|\s*NDCC['"`]/.test(read(file)));
  assert.deepEqual(offenders, []);
  assert.match(read('app/raffle/cash/page.tsx'), /title:'Trailer raffle cash sales'/);
  assert.match(read('app/club-account/reset-password/page.tsx'), /title: 'Reset your club account password',/);
});

// ------------------------------------------------------ E. home h1
await check('home hero fallback renders no second h1#home-title', () => {
  const home = read('app/page.tsx');
  assert.equal((home.match(/<h1 id="home-title"/g) || []).length, 1);
  assert.match(home, /placeholder\s*\? <p className="nd-hero-title">Home of the <span>\{CLUB_NICKNAME\}\.<\/span><\/p>/);
  assert.match(home, /aria-labelledby=\{placeholder \? undefined : 'home-title'\}/);
  const page = home.slice(home.indexOf('export default function HomePage'));
  assert.match(page, /<HeroView[\s\S]*?placeholder\s*\/>[\s\S]*?<HeroSection \/>/, 'the Suspense fallback is the placeholder');
});

// --------------------------------------------- F. Dino Coach robots
await check('Dino Coach sign-in, squad and transfers pages are noindex, follow', () => {
  for (const page of ['login', 'squad', 'transfers']) {
    assert.match(read(`app/fantasy/${page}/page.tsx`), /robots: \{ index: false, follow: true \}/, page);
  }
});

console.log(`\n${checks} site audit (round 2) checks passed.`);
