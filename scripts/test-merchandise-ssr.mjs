// /merchandise renders its catalogue on the server and is cached with ISR.
//
// Covers: the route is ISR (force-static + revalidate 60) and reads no
// request data; the server page passes the live catalogue and CMS copy to the
// client; a runtime catalogue failure throws (ISR keeps the last good page)
// while a build prerender hands the client a null catalogue to retry; the
// client does not refetch products or content blocks on mount when the server
// supplied them, still loads live order windows and payment capabilities, and
// fetches the catalogue itself (and on Try again) when the server had none;
// payment-result URLs keep their noindex via next.config headers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

let checks = 0;
async function check(name, fn) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}

const transpile = (file) => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(file, imports) {
  const exports = {};
  vm.runInNewContext(transpile(file), {
    exports,
    console,
    Promise,
    // Browser globals are swapped per test on this realm's globalThis.
    fetch: (...args) => globalThis.fetch(...args),
    get document() { return globalThis.document; },
    IntersectionObserver: undefined,
    require: (name) => {
      assert.ok(name in imports, `Unexpected import in ${file}: ${name}`);
      return imports[name];
    },
  });
  return exports;
}

const heroContent = load('app/merchandise/hero-content.ts', {
  '@/lib/constants': { CLUB_NAME: 'Newcomb and District Cricket Club' },
});

// ---------------------------------------------------------------- server page
const pageSource = readFileSync('app/merchandise/page.tsx', 'utf8');
const layoutSource = readFileSync('app/merchandise/layout.tsx', 'utf8');

await check('route is ISR: force-static with revalidate 60, no per-request opt-outs', () => {
  assert.match(pageSource, /export const dynamic = 'force-static';/);
  assert.match(pageSource, /export const revalidate = 60;/);
  for (const source of [pageSource, layoutSource].map((s) => s.replace(/^\s*\/\/.*$/gm, ''))) {
    assert.doesNotMatch(source, /force-dynamic|force-no-store|revalidate = 0/);
    assert.doesNotMatch(source, /searchParams|cookies\(|headers\(/, 'the cached page reads no request data');
  }
});

await check('admin writes to products, options and order windows revalidate /merchandise', () => {
  const revalidate = readFileSync('lib/server/revalidate-public.ts', 'utf8');
  for (const resource of ['apparelProducts', 'apparelProductOptions', 'merchWindows']) {
    assert.match(revalidate, new RegExp(`${resource}: \\['/merchandise'\\]`));
  }
});

const catalogue = [{ slug: 'cap', name: 'Fixture cap', price: 30, sizes: [], options: [] }];
const server = { catalogue: async () => catalogue, blocks: async () => ({}), building: false, blockKeys: null };
const page = load('app/merchandise/page.tsx', {
  'react/jsx-runtime': jsx,
  '@/lib/apparel/public-catalogue': { loadPublicCatalogue: () => server.catalogue() },
  '@/lib/content-blocks': { getContentBlocks: (keys) => { server.blockKeys = keys; return server.blocks(); } },
  '@/lib/server/build-phase': { isBuildPrerender: () => server.building },
  './MerchandiseClient': { default: function MerchandiseClient() { return null; } },
  './hero-content': heroContent,
});

await check('module exports the ISR segment config', () => {
  assert.equal(page.dynamic, 'force-static');
  assert.equal(page.revalidate, 60);
  assert.equal(page.generateMetadata, undefined, 'no searchParams-driven metadata on the static page');
});

await check('server page passes the live catalogue and CMS copy to the client', async () => {
  server.blocks = async () => ({
    'merch.hero': { title: 'Fixture hero', body: 'Fixture hero body' },
    'merch.ordering': { title: 'Fixture ordering', body: 'Fixture ordering body' },
  });
  const element = await page.default();
  assert.equal(element.props.initialProducts, catalogue);
  assert.deepEqual([...server.blockKeys], ['merch.hero', 'merch.ordering']);
  assert.deepEqual({ ...element.props.initialHeroContent }, {
    title: 'Fixture hero', body: 'Fixture hero body', orderTitle: 'Fixture ordering', orderBody: 'Fixture ordering body',
  });
});

await check('real empty catalogue is passed as an empty list, not a failure', async () => {
  server.catalogue = async () => [];
  const element = await page.default();
  assert.deepEqual([...element.props.initialProducts], []);
});

await check('default and placeholder CMS copy keep the existing fallbacks', async () => {
  server.catalogue = async () => catalogue;
  server.blocks = async () => ({ 'merch.ordering': { body: 'Use this section to provide ordering details' } });
  const { initialHeroContent } = (await page.default()).props;
  assert.equal(initialHeroContent.title, 'Club Merchandise');
  assert.match(initialHeroContent.body, /official Newcomb and District Cricket Club gear/);
  assert.equal(initialHeroContent.orderTitle, 'Ordering Information');
  assert.equal(initialHeroContent.orderBody, '');
});

await check('runtime catalogue failure throws so ISR never caches a failure page', async () => {
  server.catalogue = async () => { throw new Error('Catalogue unavailable'); };
  server.building = false;
  await assert.rejects(page.default(), /Catalogue unavailable/);
});

await check('build prerender failure hands the client a null catalogue to retry live', async () => {
  server.building = true;
  const element = await page.default();
  assert.equal(element.props.initialProducts, null);
  server.building = false;
});

// -------------------------------------------------------------- client island
const effects = [];
const fakeReact = { ...React, useEffect: (fn) => { effects.push(fn); } };
const passthrough = ({ children }) => React.createElement('div', null, children);
const client = load('app/merchandise/MerchandiseClient.tsx', {
  react: fakeReact,
  'react/jsx-runtime': jsx,
  'next/navigation': { useSearchParams: () => new URLSearchParams('') },
  'lucide-react': { AlertTriangle: () => null, XCircle: () => null },
  '@/components/ui/Card': { default: passthrough, CardContent: passthrough },
  '@/components/common/ScrollReveal': { default: passthrough },
  '@/lib/utils': { formatCurrency: (n) => `$${n}`, validateEmail: () => true, validatePhone: () => true },
  '@/lib/apparel/pricing': { computeUnitPrice: () => ({ ok: false }) },
  '@/lib/apparel/personalisation': { personalisationKind: () => 'name', validatePersonalisation: () => ({ ok: true, value: {} }) },
  './components/CartSummary': { default: () => null },
  './components/CheckoutForm': { default: () => null },
  '@/lib/merch-order-attempt': { merchAttemptKey: () => 'key', merchAttemptSignature: () => '', merchAttemptDigest: async () => null, merchVisitStartedAt: () => 1, withMerchAttemptLock: async (task) => task(), pruneMerchAttempt() {}, completeMerchAttempt() {}, forgetMerchAttempt() {} },
  '@/components/common/TurnstileWidget': { default: () => null, useTurnstile: () => ({ required: false, token: null, setToken() {}, reset() {}, resetKey: 0, ready: true, check: () => true, message: '' }) },
  './components/OrderConfirmationPanel': { default: () => null },
  './components/ProductCatalogue': {
    default: ({ products, productsLoading, liveProductsFailed, heroContent: hero }) => React.createElement('div', {
      'data-loading': String(productsLoading), 'data-failed': String(liveProductsFailed), 'data-order-title': hero.orderTitle,
    }, products.map((p) => React.createElement('span', { key: p.id }, p.name))),
  },
});

const hero = { title: 'Fixture hero', body: 'Fixture hero body', orderTitle: 'Fixture ordering', orderBody: '' };

async function mount(initialProducts) {
  effects.length = 0;
  const html = renderToStaticMarkup(React.createElement(client.default, { initialProducts, initialHeroContent: hero }));
  const requested = [];
  const realFetch = globalThis.fetch;
  const realDocument = globalThis.document;
  globalThis.document = { title: '', getElementById: () => null };
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return { ok: true, status: 200, json: async () => ({ data: String(url).includes('/api/apparel/products') ? [] : null }) };
  };
  try {
    for (const effect of effects) effect();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    globalThis.fetch = realFetch;
    globalThis.document = realDocument;
  }
  return { html, requested };
}

await check('server-supplied products render in the first HTML with the CMS hero copy', async () => {
  const { html } = await mount([{ slug: 'cap', name: 'Fixture cap', price: 30, sizes: [], options: [] }]);
  assert.match(html, /Fixture cap/);
  assert.match(html, /Fixture hero body/);
  assert.match(html, /data-order-title="Fixture ordering"/);
  assert.match(html, /data-loading="false"/);
  assert.match(html, /data-failed="false"/);
});

await check('client does not refetch products or content blocks on mount when the server supplied them', async () => {
  const { requested } = await mount([{ slug: 'cap', name: 'Fixture cap', price: 30, sizes: [], options: [] }]);
  assert.ok(!requested.some((url) => url.includes('/api/apparel/products')), requested.join(', '));
  assert.ok(!requested.some((url) => url.includes('/api/public/content-blocks')), requested.join(', '));
  assert.ok(requested.includes('/api/apparel/windows'), 'order windows stay live');
  assert.ok(requested.includes('/api/payments/capabilities'), 'payment capabilities stay live');
  assert.equal(requested.length, 2);
});

await check('without a server catalogue the client shows loading and fetches the live catalogue', async () => {
  const { html, requested } = await mount(null);
  assert.match(html, /data-loading="true"/);
  assert.ok(requested.includes('/api/apparel/products'));
});

await check('client keeps the unavailable banner + Try again path and live product reloads', () => {
  const merch = readFileSync('app/merchandise/MerchandiseClient.tsx', 'utf8');
  const catalogueUi = readFileSync('app/merchandise/components/ProductCatalogue.tsx', 'utf8');
  assert.match(merch, /const fetchProducts = serverCatalogueMissing \|\| productsReloadKey > 0;/);
  assert.match(merch, /setProducts\(\[\]\);\s*setLiveProductsFailed\(true\);/);
  assert.match(catalogueUi, /setProductsReloadKey\(\(key\) => key \+ 1\)/);
  assert.match(catalogueUi, /Try again/);
});

await check('payment-result query is read in the browser inside its own Suspense boundary', () => {
  const merch = readFileSync('app/merchandise/MerchandiseClient.tsx', 'utf8');
  assert.match(merch, /<Suspense fallback=\{null\}>\s*<PaymentResultListener onResult=\{setSubmitStatus\} \/>/);
  assert.match(merch, /searchParams\.get\('payment'\) === 'submitted' \|\| searchParams\.get\('success'\) === 'true'/);
  assert.match(merch, /searchParams\.get\('payment'\) === 'cancelled' \|\| searchParams\.get\('cancelled'\) === 'true'/);
});

await check('payment-result URLs on the static page stay noindex via X-Robots-Tag', async () => {
  const { default: config } = await import('../next.config.mjs');
  const headers = await config.headers();
  for (const key of ['payment', 'success', 'cancelled', 'session_id']) {
    const rule = headers.find((x) => x.source === '/merchandise' && x.has?.some((h) => h.type === 'query' && h.key === key));
    assert.ok(rule, `rule for ?${key}`);
    assert.ok(rule.headers.some((h) => h.key === 'X-Robots-Tag' && h.value === 'noindex, nofollow'));
  }
  assert.ok(!headers.some((x) => x.source === '/merchandise' && !x.has), 'plain /merchandise stays indexable');
});

console.log(`merchandise SSR tests passed (${checks} checks)`);
