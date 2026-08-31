import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as newsGallery from '../lib/news-gallery.ts';

const { parseNewsContent, stripNewsGalleryContent } = newsGallery;

const content = [
  'The club is pleased to announce the 2026/27 senior captains.',
  '',
  'Congratulations to everyone appointed.',
  '',
  '[[news-image:/images/news/2026/captains/20260827-NDCC-2XI-Captains-Rev00.webp|2nd XI captains Josh Walker and Tyson Henry]]',
  '[[news-image:/images/news/2026/captains/20260827-NDCC-3XI-Captains-Rev00.webp|3rd XI captains Troy Whitworth and Rick McHutchison]]',
  '[[news-image:/images/news/2026/captains/20260827-NDCC-2XI-Captains-Rev00.webp|Duplicate image should be ignored]]',
].join('\n');

const parsed = parseNewsContent(content);

assert.equal(
  parsed.body,
  'The club is pleased to announce the 2026/27 senior captains.\n\nCongratulations to everyone appointed.',
  'gallery directives must not leak into public article text',
);
assert.deepEqual(parsed.images, [
  {
    src: '/images/news/2026/captains/20260827-NDCC-2XI-Captains-Rev00.webp',
    alt: '2nd XI captains Josh Walker and Tyson Henry',
  },
  {
    src: '/images/news/2026/captains/20260827-NDCC-3XI-Captains-Rev00.webp',
    alt: '3rd XI captains Troy Whitworth and Rick McHutchison',
  },
]);
assert.equal(stripNewsGalleryContent(content), parsed.body);

const unsafe = parseNewsContent(
  'Visible text\n[[news-image:/images/../secret.webp|Unsafe traversal]]\n[[news-image:https://example.com/remote.webp|Remote image]]',
);
assert.equal(unsafe.images.length, 0, 'only local /images paths without traversal are accepted');
assert.match(unsafe.body, /Unsafe traversal/);
assert.match(unsafe.body, /Remote image/);

assert.equal(
  typeof newsGallery.serializeNewsContent,
  'function',
  'news gallery helper must serialise the editable article body and ordered image list',
);

if (typeof newsGallery.serializeNewsContent === 'function') {
  const serialised = newsGallery.serializeNewsContent('Body text', [
    { src: '/images/news/2026/captains/1.webp', alt: 'First image' },
    { src: '/images/news/2026/captains/2.webp', alt: 'Second image' },
  ]);
  assert.equal(
    serialised,
    'Body text\n\n[[news-image:/images/news/2026/captains/1.webp|First image]]\n[[news-image:/images/news/2026/captains/2.webp|Second image]]',
    'serialisation must preserve body text and image ordering',
  );
  assert.deepEqual(parseNewsContent(serialised), {
    body: 'Body text',
    images: [
      { src: '/images/news/2026/captains/1.webp', alt: 'First image' },
      { src: '/images/news/2026/captains/2.webp', alt: 'Second image' },
    ],
  });
}

const adminNewsSource = readFileSync(new URL('../app/admin/news/page.tsx', import.meta.url), 'utf8');
assert.match(
  adminNewsSource,
  /NewsImageUploadField/,
  'News CMS must use the dedicated multi-image upload/editor control',
);

let multiImageFieldSource = '';
try {
  multiImageFieldSource = readFileSync(new URL('../components/admin/NewsImageUploadField.tsx', import.meta.url), 'utf8');
} catch {
  multiImageFieldSource = '';
}
assert.match(multiImageFieldSource, /multiple/, 'News image picker must allow selecting multiple files');
assert.match(multiImageFieldSource, /alt/i, 'News image editor must expose alt text for accessibility');
assert.match(multiImageFieldSource, /Move up|moveImage/i, 'News image editor must support deterministic reordering');
assert.match(multiImageFieldSource, /Remove/i, 'News image editor must support removing an image before save');

console.log('News gallery and multi-image CMS tests passed.');
