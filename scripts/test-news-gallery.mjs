import assert from 'node:assert/strict';
import { parseNewsContent, stripNewsGalleryContent } from '../lib/news-gallery.ts';

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

console.log('News gallery parser tests passed.');
