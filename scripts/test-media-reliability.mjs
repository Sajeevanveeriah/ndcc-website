import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { normaliseMediaUrl } from '../lib/media-url.ts';
import { prepareCmsImage } from '../lib/prepare-cms-image.ts';
import { validateMedia } from '../lib/server/cms-media.ts';
import { createTimeoutFetch } from '../lib/server/timeout-fetch.ts';

assert.equal(normaliseMediaUrl('https://github.com/Sajeevanveeriah/ndcc-website/blob/main/public/images/poster.png?raw=true'), '/images/poster.png');
assert.equal(normaliseMediaUrl('public/images/poster.png'), '/images/poster.png');
assert.equal(normaliseMediaUrl('https://github.com/example/assets/blob/main/poster.png'), 'https://raw.githubusercontent.com/example/assets/main/poster.png');
assert.equal(normaliseMediaUrl('https://github.com.evil.example/a/b/blob/main/x'), 'https://github.com.evil.example/a/b/blob/main/x');
assert.equal(normaliseMediaUrl('/images/unchanged.webp'), '/images/unchanged.webp');

// The original 9000 x 11250 practice-match PNG upload has been replaced by its
// WebP (the old path redirects), so reproduce an upload of the same pixel size.
const actualPoster = await sharp({ create: { width: 9000, height: 11250, channels: 3, background: '#800020' } }).png().toBuffer();
await assert.rejects(validateMedia(actualPoster, 'image/png'), /pixel limit/);
const preparedPoster = readFileSync(new URL('../public/images/2026/09/20260913-ndcc-practice-match-rev02.webp', import.meta.url));
const valid = await validateMedia(preparedPoster, 'image/webp');
const metadata = await sharp(valid.content).metadata();
assert.equal(metadata.width, 1920);
assert.equal(metadata.height, 2400);
assert(valid.content.length < 200_000);

// Browser preparation contract: verify dimensions, conversion, passthrough and cleanup.
const originalImage = globalThis.Image, originalDocument = globalThis.document;
const createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL;
let revoked = 0, canvas;
URL.createObjectURL = () => 'blob:test'; URL.revokeObjectURL = () => { revoked += 1; };
globalThis.Image = class { naturalWidth = 9000; naturalHeight = 11250; set src(_) { queueMicrotask(() => this.onload()); } };
globalThis.document = { createElement: () => (canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob(callback) { callback(new Blob([preparedPoster], { type: 'image/webp' })); } }) };
try {
  const result = await prepareCmsImage(new File([actualPoster], 'poster.png', { type: 'image/png' }));
  assert.equal(result.type, 'image/webp'); assert.equal(canvas.width, 1920); assert.equal(canvas.height, 2400);
  assert.equal(revoked, 1);
  const pdf = new File(['%PDF'], 'file.pdf', { type: 'application/pdf' });
  assert.equal(await prepareCmsImage(pdf), pdf);
  globalThis.Image = class { set src(_) { queueMicrotask(() => this.onerror()); } };
  await assert.rejects(prepareCmsImage(new File(['invalid'], 'bad.png', { type: 'image/png' })), /cannot be opened/);
  assert.equal(revoked, 2);
} finally {
  globalThis.Image = originalImage; globalThis.document = originalDocument;
  URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl;
}
const originalFetch = globalThis.fetch;
let calls = 0;
try {
  globalThis.fetch = async (_input, init) => {
    calls += 1; assert.equal(init.cache, 'no-store');
    if (calls === 1) throw new TypeError('fetch failed');
    return new Response('ok');
  };
  assert.equal(await (await createTimeoutFetch(100, true)('https://example.test')).text(), 'ok'); assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(createTimeoutFetch(100, true)('https://example.test', { method: 'POST' })); assert.equal(calls, 1);
  calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('', { status: 503 }); };
  assert.equal((await createTimeoutFetch(100, true)('https://example.test')).status, 503); assert.equal(calls, 2);
  calls = 0;
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async () => { calls += 1; throw new DOMException('aborted', 'AbortError'); };
  await assert.rejects(createTimeoutFetch(100, true)('https://example.test', { signal: controller.signal })); assert.equal(calls, 1);
  calls = 0;
  globalThis.fetch = (_input, init) => { calls += 1; return new Promise((_resolve,reject) => init.signal.addEventListener('abort', () => reject(new DOMException('timeout','AbortError')))); };
  await assert.rejects(createTimeoutFetch(5, true)('https://example.test')); assert.equal(calls, 2);
} finally { globalThis.fetch = originalFetch; }
console.log('PASS: actual poster rejection/re-encoding, browser preparation contract, repository URLs, bounded read retry, cancellation and write non-replay.');
