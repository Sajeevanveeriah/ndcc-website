import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function load(path, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { exports, Buffer, require: (key) => {
    if (key in imports) return imports[key];
    if (key === 'node:crypto') return require('node:crypto');
    throw new Error(`Unexpected import: ${key}`);
  } });
  return exports;
}

const emailHtml = load('lib/email-html.ts');
const newsletter = load('lib/newsletter.ts', { './email-html': emailHtml });

// Recipient selection: explicit opt-in only, valid emails, one copy per address.
const member = (id, email, name = 'Member') => ({ id, email, full_name: name });
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'];
const recipients = newsletter.selectNewsletterRecipients([
  { member_id: ids[0], email_updates: true, club_members: member(ids[0], 'b@example.com', 'Bee') },
  { member_id: ids[1], email_updates: false, club_members: member(ids[1], 'no@example.com') },
  { member_id: ids[2], email_updates: null, club_members: member(ids[2], 'unset@example.com') },
  { member_id: ids[3], email_updates: true, club_members: [member(ids[3], 'A@Example.com', 'Ay')] },
  { member_id: ids[4], email_updates: true, club_members: member(ids[4], 'a@example.com', 'Shared') },
  { member_id: 'not-a-uuid', email_updates: true, club_members: member('x', 'x@example.com') },
  { member_id: ids[1], email_updates: 'true', club_members: member(ids[1], 'string@example.com') },
  { member_id: ids[2], email_updates: true, club_members: member(ids[2], 'bad address') },
  { member_id: ids[2], email_updates: true, club_members: null },
]);
assert.deepEqual(JSON.parse(JSON.stringify(recipients)), [
  { member_id: ids[3], email: 'A@Example.com', name: 'Ay' },
  { member_id: ids[0], email: 'b@example.com', name: 'Bee' },
]);
assert.deepEqual(JSON.parse(JSON.stringify(newsletter.selectNewsletterRecipients(null))), []);
assert.match(read('lib/server/newsletter.ts'), /\.eq\('email_updates', true\)/, 'the database query also selects opt-ins only');

// Unsubscribe tokens: signed, member-bound, tamper-proof.
const key = newsletter.unsubscribeSigningKey({ SUPABASE_SERVICE_ROLE_KEY: 'isolated-test-service-key' });
const otherKey = newsletter.unsubscribeSigningKey({ SUPABASE_SERVICE_ROLE_KEY: 'another-key' });
assert.equal(newsletter.unsubscribeSigningKey({}), null, 'no secret, no tokens');
assert.notEqual(key, 'isolated-test-service-key', 'the raw service key is never used directly');
assert.notEqual(newsletter.unsubscribeSigningKey({ NEWSLETTER_UNSUBSCRIBE_SECRET: 'dedicated', SUPABASE_SERVICE_ROLE_KEY: 'isolated-test-service-key' }), key, 'a dedicated secret takes precedence');
const token = newsletter.signUnsubscribeToken(ids[0], key);
assert.equal(newsletter.verifyUnsubscribeToken(token, key), ids[0]);
assert.equal(newsletter.verifyUnsubscribeToken(token, otherKey), null);
assert.equal(newsletter.verifyUnsubscribeToken(token.replace(ids[0], ids[1]), key), null, 'a token cannot be moved to another member');
assert.equal(newsletter.verifyUnsubscribeToken(`${token}x`, key), null);
assert.equal(newsletter.verifyUnsubscribeToken(`${token}.extra`, key), null);
assert.equal(newsletter.verifyUnsubscribeToken('', key), null);
assert.equal(newsletter.verifyUnsubscribeToken(null, key), null);
assert.throws(() => newsletter.signUnsubscribeToken('bad', key));

// Markdown-lite rendering escapes everything authors type.
const html = newsletter.renderNewsletterBody('# Season <launch>\n\nHello **members** & friends.\nLine two.\n\n- One\n- [Join](https://www.ndcc.com.au/join)\n\n[bad](javascript:alert(1)) <script>alert(1)</script> <img src=x onerror=alert(1)>');
assert.match(html, /<h2[^>]*>Season &lt;launch&gt;<\/h2>/);
assert.match(html, /Hello <strong>members<\/strong> &amp; friends\.<br>Line two\./);
assert.match(html, /<ul[^>]*><li[^>]*>One<\/li><li[^>]*><a href="https:\/\/www\.ndcc\.com\.au\/join"[^>]*>Join<\/a><\/li><\/ul>/);
assert.ok(!/<script|<img|href="javascript/i.test(html), 'no author markup or unsafe links survive');
const quoted = newsletter.renderNewsletterBody('[x](https://e.com/"onmouseover="alert(1))');
assert.match(quoted, /href="https:\/\/e\.com\/&quot;onmouseover=&quot;alert\(1"/);
assert.ok(!/onmouseover="/.test(quoted), 'quotes cannot break out of the link');
assert.match(newsletter.newsletterFooterHtml('https://www.ndcc.com.au/api/club-account/unsubscribe?token=a&b'), /token=a&amp;b/);

// Input validation.
assert.equal(newsletter.validateNewsletterInput('', 'x').ok, false);
assert.equal(newsletter.validateNewsletterInput('Line\nbreak', 'x').ok, false, 'no header injection through the subject');
assert.equal(newsletter.validateNewsletterInput('Subject', 'x'.repeat(20001)).ok, false);
assert.equal(newsletter.validateNewsletterInput(' Subject ', ' Body\r\n').subject, 'Subject');

// Rate limit: batch size x interval stays at or under 2 emails per second.
assert.ok(1000 / newsletter.NEWSLETTER_SEND_INTERVAL_MS <= 2);
const route = read('app/api/admin/newsletter/route.ts');
assert.match(route, /requirePermission\('memberships'\)/);
assert.match(route, /body\?\.confirm_recipient_count !== count/, 'sending requires the confirmed recipient count');
assert.match(route, /idempotencyKey: `ndcc-newsletter-\$\{sendId\}-\$\{row\.id\}`/, 'every delivery has an idempotency key');
assert.match(route, /No longer opted in/, 'unsubscribes during a send are honoured');
const unsubscribe = read('app/api/club-account/unsubscribe/route.ts');
assert.ok(!/export async function GET[\s\S]*?\.update\(/.test(unsubscribe.split('export async function POST')[0]), 'GET never changes preferences');
assert.match(unsubscribe, /\.update\(\{ email_updates: false/);

console.log('Newsletter opt-in selection, unsubscribe token signing, safe rendering and send guards passed.');
