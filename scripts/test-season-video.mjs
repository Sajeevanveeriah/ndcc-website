import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

// Season slideshow on /gallery: poster first, video fetched only on play, no
// download affordances, and a web-sized file served with a long cache.
const component = readFileSync('components/gallery/SeasonHighlightsVideo.tsx', 'utf8');
const gallery = readFileSync('app/gallery/page.tsx', 'utf8');
const home = readFileSync('app/page.tsx', 'utf8');
const config = readFileSync('next.config.mjs', 'utf8');

const video = 'public/media/20260928-NDCC-Season-Slideshow-Web-Rev00.mp4';
const poster = 'public/media/20260928-NDCC-Season-Slideshow-Poster-Rev00.webp';
const webm = 'public/media/20260928-NDCC-Season-Slideshow-Web-Rev00.webm';
assert.ok(existsSync(video) && existsSync(poster) && existsSync(webm));
assert.ok(statSync(webm).size < 20 * 1024 * 1024, 'WebM copy stays under 20 MB');
assert.deepEqual([...readFileSync(webm).subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], 'WebM (EBML) container');
assert.ok(statSync(video).size < 20 * 1024 * 1024, 'web copy stays under 20 MB');
assert.ok(statSync(poster).size < 100 * 1024, 'poster stays small');
assert.equal(readFileSync(video).subarray(4, 8).toString('latin1'), 'ftyp', 'MP4 container');
assert.ok(!existsSync('public/media/20260928-NDCC-Season-Slideshow-Share-Rev04-compressed.mp4'), 'full-size upload is not served');

assert.match(component, /\{started && !failed \? \(\s*<video/, 'the <video> (and its URL) only exists after play is pressed');
assert.match(component, /controlsList="nodownload noplaybackrate"/);
assert.match(component, /disablePictureInPicture/);
assert.match(component, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
assert.match(component, /preload="none"/);
assert.match(component, /canPlayType\('video\/mp4; codecs="avc1\.64001F, mp4a\.40\.2"'\) \? SEASON_SLIDESHOW_VIDEO : SEASON_SLIDESHOW_WEBM/, 'MP4 when H.264 plays, else WebM');
assert.match(component, /onError=\{\(\) => \{[\s\S]*?getAttribute\('src'\) === SEASON_SLIDESHOW_VIDEO\)[\s\S]*?video\.src = SEASON_SLIDESHOW_WEBM;[\s\S]*?setFailed\(true\);/, 'video-level errors retry the WebM once, then show the message');
assert.doesNotMatch(component, /<source /, 'no <source> elements: their error events miss decode failures');
assert.match(component, /aria-label=\{`Play \$\{TITLE\} slideshow video \(5 minutes 12 seconds, with sound\)`\}/);
assert.doesNotMatch(component, /download=|href=\{SEASON_SLIDESHOW_VIDEO\}/, 'no download link');

assert.match(gallery, /<section id="season-highlights"/);
assert.match(gallery, /<SeasonHighlightsVideo \/>/);
assert.match(home, /href="\/gallery#season-highlights"/);
assert.match(config, /source: '\/media\/:file\*',\s*headers: \[\{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' \}\]/);
console.log('Season video: poster first, fetched on play only, no download controls, web-sized file, long cache.');
