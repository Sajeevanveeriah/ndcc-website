import assert from 'node:assert/strict';
import { serializeJsonLd } from '../lib/json-ld.ts';

const payload = serializeJsonLd({ title: '</script><script>alert(1)</script>', separator: '\u2028' });
assert.doesNotMatch(payload, /<|>|&|\u2028/, 'serialised JSON-LD must not contain HTML-breaking characters');
assert.deepEqual(JSON.parse(payload), { title: '</script><script>alert(1)</script>', separator: '\u2028' });
console.log('JSON-LD injection regression test passed.');
