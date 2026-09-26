#!/usr/bin/env node
// Static source checks for the official club colours, calm motion and the
// related accessibility clean-up. Deterministic: reads files only.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (file) => readFileSync(file, 'utf8');
let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}: ${error.message}`);
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|mjs|cjs|css|json|webmanifest)$/.test(name)) out.push(full);
  }
  return out;
}

const sourceFiles = [...walk('app'), ...walk('components'), ...walk('lib'), 'tailwind.config.ts', 'public/dino-coach.webmanifest'];
const publicUiFiles = [...walk('app'), ...walk('components')].filter((file) => file.endsWith('.tsx') && !/(^|\/)admin\//.test(file));

check('no superseded brand colour values remain', () => {
  const retired = /#800000\b|#add8e6\b|#d4a017\b|\b128 0 0\b|\b173 216 230\b|\b212 160 23\b|rgba?\(\s*128,\s*0,\s*0\b|rgba?\(\s*212,\s*160,\s*23\b|rgba?\(\s*173,\s*216,\s*230\b/i;
  const offenders = sourceFiles.filter((file) => retired.test(read(file)));
  assert.deepEqual(offenders, []);
});

check('tailwind uses the official maroon, blue and gold', () => {
  const config = read('tailwind.config.ts');
  assert.match(config, /600: '#880000'/);
  assert.match(config, /700: '#880000'/);
  assert.match(config, /800: '#600000'/);
  assert.match(config, /DEFAULT: '#8cc6d1'/);
  assert.match(config, /400: '#edc266'/);
  assert.match(config, /navy: '#162845'/);
});

check('shared brand constant matches the official colours', () => {
  const brand = read('lib/brand-colours.ts');
  for (const value of ["maroon: '#880000'", "blue: '#8cc6d1'", "gold: '#edc266'", "navy: '#162845'"]) assert.ok(brand.includes(value), value);
  assert.match(read('app/layout.tsx'), /content=\{BRAND_COLOURS\.maroon\}/);
});

const globals = read('app/globals.css');
check('theme tokens use the official colours in light and dark', () => {
  assert.equal((globals.match(/--action-primary: 136 0 0;/g) || []).length, 2);
  assert.equal((globals.match(/--action-accent: 140 198 209;/g) || []).length, 2);
  assert.equal((globals.match(/--brand-gold: 237 194 102;/g) || []).length, 2);
  assert.match(globals, /--brand-maroon-surface: 136 0 0;/);
});

check('blue buttons never carry white text', () => {
  const accent = globals.match(/\.btn-accent \{[^}]*\}/)?.[0] ?? '';
  assert.match(accent, /bg-sky_accent/);
  assert.match(accent, /text-maroon-900/);
  assert.ok(!/text-white/.test(accent));
  assert.match(read('components/ui/Button.tsx'), /bg-sky_accent text-maroon-900/);
});

check('retired motion modules are gone', () => {
  for (const file of [
    'components/common/motion/HeroParallax.tsx',
    'components/common/motion/MaskReveal.tsx',
    'components/common/RouteSettle.tsx',
    'lib/motion-tokens.ts',
  ]) assert.ok(!existsSync(file), `${file} should be deleted`);
});

check('tilt, parallax and counter wrappers render statically', () => {
  for (const file of [
    'components/common/motion/TiltCard.tsx',
    'components/common/motion/ParallaxLayer.tsx',
    'components/common/AnimatedCounter.tsx',
  ]) {
    const source = read(file);
    assert.ok(!source.includes('framer-motion'), `${file} must not use framer-motion`);
    assert.ok(!/opacity:\s*0|useEffect|setInterval/.test(source), `${file} must not hide or animate content`);
  }
  assert.ok(!read('app/layout.tsx').includes('RouteSettle'));
});

check('scroll reveal is subtle, server-rendered and never hides content without JS', () => {
  const reveal = read('components/common/ScrollReveal.tsx');
  assert.ok(!reveal.includes('framer-motion') && !reveal.includes("'use client'"), 'ScrollReveal stays a server component');
  assert.ok(!/opacity|useEffect/.test(reveal), 'ScrollReveal renders children as-is');
  assert.match(reveal, /data-reveal/);
  const observer = read('components/common/RevealObserver.tsx');
  assert.match(observer, /prefers-reduced-motion: reduce/);
  // In-view blocks are revealed before the effect is switched on, so nothing visible blinks.
  assert.ok(observer.indexOf('revealVisible();') < observer.indexOf("classList.add('reveal-on')"));
  assert.match(read('app/layout.tsx'), /<RevealObserver \/>/);
  // Hidden state only applies under html.reveal-on, moves at most 16px and is off for reduced motion and print.
  assert.match(globals, /\.reveal-on \[data-reveal\]:not\(\[data-revealed\]\)/);
  const distance = Number(globals.match(/translate3d\(0, (\d+)px, 0\)/)?.[1]);
  assert.ok(distance > 0 && distance <= 16, `reveal distance ${distance}px`);
  assert.match(globals, /@media \(prefers-reduced-motion: reduce\), print \{\s*\.reveal-on/);
});

check('hover and press motion stays within 2px', () => {
  assert.match(globals, /\.card-interactive:hover \{[^}]*translateY\(-2px\)/);
  assert.match(globals, /\.card-interactive:hover \{ transform: none; \}/);
  assert.match(globals, /:active \{\s*transform: translateY\(1px\);/);
});

check('global CSS has no entrance, zoom or lift animation', () => {
  for (const token of ['fadeUpIn', 'routeSettle', 'route-settle', 'kenBurns', 'floatY', 'shimmerSweep', 'pulseRing', 'hero-ambient', 'hero-scroll-hint', 'club-home-photo', 'club-ground-caption', '.img-zoom', '.hover-lift', 'scale-105', 'translate-y', 'text-[11px]', 'active:scale']) {
    assert.ok(!globals.includes(token), `${token} should be removed`);
  }
  assert.ok(!/animation:/.test(read('tailwind.config.ts')), 'no custom Tailwind animations');
});

check('public UI has no hover lift or image zoom', () => {
  const pattern = /hover:-translate-y|group-hover:-translate-y|hover:scale-1\d\d|group-hover:scale-1\d\d|\bimg-zoom\b|\bhover-lift\b|hover:shadow-lift/;
  const offenders = publicUiFiles.filter((file) => pattern.test(read(file)));
  assert.deepEqual(offenders, []);
});

check('marquees keep their pause controls', () => {
  assert.match(read('components/home/SponsorsMarquee.tsx'), /sponsor-marquee-toggle/);
  assert.match(read('components/home/SeasonAppointmentsMarquee.tsx'), /season-appointments-marquee-toggle/);
  assert.match(globals, /\.homepage-marquee-track\.marquee-manually-paused/);
});

check('route progress is a thin solid maroon bar', () => {
  const progress = read('components/common/RouteProgress.tsx');
  assert.match(progress, /h-0\.5 bg-maroon-700/);
  assert.ok(!/gradient|sky_accent|shadow-\[/.test(progress));
});

check('theme follows the system by default', () => {
  const provider = read('components/common/ThemeProvider.tsx');
  assert.match(provider, /defaultTheme="system"/);
  assert.match(provider, /enableSystem/);
});

check('theme toggle buttons are 44px touch targets', () => {
  assert.match(read('components/common/ThemeToggle.tsx'), /h-11 w-11/);
});

check('navigation and footer landmarks and text sizes', () => {
  const nav = read('components/layout/Navbar.tsx');
  const footer = read('components/layout/Footer.tsx');
  assert.ok(!nav.includes('role="navigation"'), 'redundant nav role removed');
  assert.ok(!footer.includes('role="contentinfo"'), 'redundant footer role removed');
  assert.ok(!/\btransparent\b/.test(nav), 'dead transparent navbar branches removed');
  for (const [label, source] of [['nav', nav], ['footer', footer]]) {
    assert.ok(!/text-\[(9|10|11|12|13)px\]/.test(source), `${label} text is at least 14px`);
  }
  assert.ok(!footer.includes('text-maroon-400'), 'footer credit uses a higher-contrast tint');
});

check('images carry descriptive alt text', () => {
  assert.match(read('app/gallery/page.tsx'), /alt=\{`Cover photo for the \$\{album\.title\} album`\}/);
  assert.match(read('components/publications/PublicationCard.tsx'), /alt=\{`Cover of \$\{publication\.title\}`\}/);
});

check('home stats strip has an accessible heading', () => {
  const stats = read('components/home/HomeStatsStrip.tsx');
  // The stats are a static list inside the hero, labelled for assistive technology.
  assert.match(stats, /<dl[^>]*aria-label="Club at a glance"/);
});

check('marquee edge fades and dino frame use theme tokens', () => {
  const appointments = read('components/home/SeasonAppointmentsMarquee.tsx');
  assert.ok(!appointments.includes('dark:from-slate-800'));
  assert.match(appointments, /from-surface-(card|page) to-(transparent|surface-(card|page)\/0)/);
  assert.doesNotMatch(appointments, /from-slate-|from-white/);
  assert.ok(!read('components/home/ClubIntro.tsx').includes('bg-[#dedede]'));
});

check('FullCalendar loads on demand without SSR', () => {
  const calendar = read('components/calendar/NdccCalendar.tsx');
  assert.match(calendar, /dynamic\(\(\) => import\('\.\/FullCalendarView'\), \{\s*ssr: false/);
  assert.ok(!calendar.includes("from '@fullcalendar/react'"));
  assert.match(calendar, /Loading calendar\.\.\./);
});

check('season appointments skip the client re-fetch when SSR data exists', () => {
  assert.match(read('components/home/SeasonAppointmentsMarquee.tsx'), /if \(hasServerAppointments\) return;/);
});

if (failures) {
  console.error(`${failures} brand/calm-motion check(s) failed.`);
  process.exit(1);
}
console.log('Brand colour and calm motion checks passed.');
