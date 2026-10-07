import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

// Season slideshow on /gallery: poster first, video fetched only on play, no
// download affordances, and a web-sized file served with a long cache.
const component = readFileSync('components/gallery/SeasonHighlightsVideo.tsx', 'utf8');
const gallery = readFileSync('app/gallery/(list)/page.tsx', 'utf8');
const home = readFileSync('app/page.tsx', 'utf8');
const config = readFileSync('next.config.mjs', 'utf8');

for (const name of ['Slideshow', 'Launch']) {
  const video = `public/media/20260928-NDCC-Season-${name}-Web-Rev00.mp4`;
  const poster = `public/media/20260928-NDCC-Season-${name}-Poster-Rev00.webp`;
  const webm = `public/media/20260928-NDCC-Season-${name}-Web-Rev00.webm`;
  assert.ok(existsSync(video) && existsSync(poster) && existsSync(webm), `${name}: MP4, WebM and poster present`);
  assert.ok(statSync(webm).size < 20 * 1024 * 1024, `${name}: WebM copy stays under 20 MB`);
  assert.deepEqual([...readFileSync(webm).subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], `${name}: WebM (EBML) container`);
  assert.ok(statSync(video).size < 20 * 1024 * 1024, `${name}: web copy stays under 20 MB`);
  assert.ok(statSync(poster).size < 100 * 1024, `${name}: poster stays small`);
  assert.equal(readFileSync(video).subarray(4, 8).toString('latin1'), 'ftyp', `${name}: MP4 container`);
  assert.ok(component.includes(`'/${video.slice('public/'.length)}'`) && component.includes(`'/${webm.slice('public/'.length)}'`) && component.includes(`'/${poster.slice('public/'.length)}'`), `${name}: component references its files`);
}
assert.ok(!existsSync('public/media/20260928-NDCC-Season-Launch-Rev04.mp4'), 'full-size launch video is not served');
assert.ok(!existsSync('public/media/20260928-NDCC-Season-Slideshow-Share-Rev04-compressed.mp4'), 'full-size upload is not served');

assert.match(component, /\{started && !failed \? \(\s*<video/, 'the <video> (and its URL) only exists after play is pressed');
assert.match(component, /controlsList="nodownload noplaybackrate"/);
assert.match(component, /disablePictureInPicture/);
assert.match(component, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
assert.match(component, /preload="none"/);
assert.match(component, /canPlayType\('video\/mp4; codecs="avc1\.64001F, mp4a\.40\.2"'\) \? clip\.mp4 : clip\.webm/, 'MP4 when H.264 plays, else WebM');
assert.match(component, /onError=\{\(\) => \{[\s\S]*?getAttribute\('src'\) === clip\.mp4\)[\s\S]*?video\.src = clip\.webm;[\s\S]*?setFailed\(true\);/, 'video-level errors retry the WebM once, then show the message');
assert.doesNotMatch(component, /<source /, 'no <source> elements: their error events miss decode failures');
assert.match(component, /aria-label=\{`Play \$\{clip\.title\} \$\{clip\.kind\.toLowerCase\(\)\} video \(\$\{clip\.durationSpoken\}, with sound\)`\}/);
assert.match(component, /alt=\{clip\.posterAlt\}/);
assert.match(component, /posterAlt: 'Title card: the Newcomb and District Cricket Club dinosaur badge above the words The 2025\/26 Season, Grinter Reserve, Moolap'/, 'slideshow poster has meaningful alt text (AGENTS.md)');
assert.match(component, /posterAlt: 'Opening slide: the Newcomb and District Cricket Club badge above the words 2026\/27 Season Launch, More Than the Flag, [^']+'/, 'launch poster has meaningful alt text (AGENTS.md)');
assert.match(component, /duration: '1:45',\s*durationSpoken: '1 minute 45 seconds'/, 'launch runtime matches the 1:45 file');
assert.doesNotMatch(component, /alt=""/);
assert.doesNotMatch(component, /download=|href=\{clip\./, 'no download link');

assert.match(gallery, /<section id="season-highlights"/);
assert.match(gallery, /<SeasonHighlightsVideo \/>/);
assert.match(gallery, /<section id="season-launch"[\s\S]*?<SeasonHighlightsVideo video=\{SEASON_LAUNCH\} \/>[\s\S]*?<section id="season-highlights"/, 'launch video sits above the season slideshow on /gallery');
assert.match(home, /href="\/gallery#season-highlights"/);
assert.match(config, /source: '\/media\/:file\*',\s*headers: \[\{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' \}\]/);
console.log('Season videos (slideshow and launch): poster first, fetched on play only, no download controls, web-sized file, long cache.');
