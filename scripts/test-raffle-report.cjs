const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText)(name => { assert.ok(name in dependencies, name); return dependencies[name]; }, exports);
  return exports;
}
const report = load('lib/raffle-report.ts', { './csv': load('lib/csv.ts') });
const base = { id: 'one', campaign_id: 'trailer', payment_reference: 'NDCCRAF-2026-000001', customer_name: '=HYPERLINK("malicious")', customer_email: 'buyer@example.invalid', customer_phone: '+61400000000', quantity: 2, amount_cents: 1000, status: 'paid', payment_method: 'cash', created_at: '2026-09-24T23:00:00Z', paid_at: '2026-09-24T23:00:00Z', cash_received_at: '2026-09-24T23:00:00Z', cash_handed_in_at: null, cash_received_by_member: 'member', member: { full_name: 'Member Collector' }, staff: null, customer_email_sent_at: null, raffle_tickets: [{ ticket_number: 201, ticket_reference: 'NDCCTRO-20260201' }, { ticket_number: 200, ticket_reference: 'NDCCTRO-20260200' }], receipt_delivery_jobs: [{ status: 'queued' }] };
const orders = [base, { ...base, id: 'two', status: 'pending', raffle_tickets: [] }, { ...base, id: 'three', status: 'refunded' }, { ...base, id: 'four', campaign_id: 'reverse' }, { ...base, id: 'five', cash_received_by_member: null, member: null, staff: { full_name: 'Committee' } }];
assert.equal(report.filterRaffleOrders(orders, 'trailer', '20260201', 'paid', 'cash').length, 2);
assert.equal(report.filterRaffleOrders(orders, 'trailer', 'member collector', 'paid', 'all').length, 1);
assert.equal(report.filterRaffleOrders(orders, 'trailer', '', 'all', 'stripe').length, 0);
assert.deepEqual(report.raffleSalesSummary(orders.filter(row => row.campaign_id === 'trailer')), { paidOrders: 2, tickets: 4, paidCents: 2000, outstandingCashCents: 1000 });
assert.equal(report.raffleSalesSummary([{ ...base, cash_handed_in_at: '2026-09-25T00:00:00Z' }]).outstandingCashCents, 0);
const csv = report.raffleOrdersCsv([base], 'Trailer, raffle');
assert.ok(csv.startsWith('\uFEFF'));
assert.match(csv, /"Trailer, raffle"/);
assert.ok(csv.includes("'=HYPERLINK"));
assert.ok(csv.includes("'+61400000000"));
assert.ok(csv.includes('NDCCTRO-20260200; NDCCTRO-20260201'));
assert.equal(base.raffle_tickets[0].ticket_number, 201, 'Exports must not reorder source records');
assert.match(csv, /10\.00,paid,cash/);
assert.match(csv, /Awaiting handover/);
assert.equal(report.raffleReportFilename('NDCCRAF', new Date('2026-09-24T23:00:00Z')), '20260925-NDCCRAF-Sales-Rev00.csv');
assert.equal(report.raffleDeliveryStatus({ ...base, receipt_delivery_jobs: [{ status: 'delivered' }] }), 'Accepted by email provider');
assert.equal(report.raffleDeliveryStatus({ ...base, receipt_delivery_jobs: [{ status: 'dead_letter' }] }), 'Needs attention');
assert.equal(report.raffleDeliveryStatus({ ...base, receipt_delivery_jobs: { status: 'queued' } }), 'Queued', 'Unique raffle-order FK embeds a single receipt object');
assert.equal(report.raffleDeliveryStatus({ ...base, receipt_delivery_jobs: null }), 'Not confirmed');
assert.equal(report.raffleDeliveryStatus({ ...base, receipt_delivery_jobs: [] }), 'Not confirmed');

(async () => {
  let auth = { user: null, status: 401, error: 'Sign in' }, reads = 0, fail = false;
  const rows = Array.from({ length: 1001 }, (_, index) => ({ ...base, id: String(index) }));
  const route = load('app/api/admin/raffle/orders/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/auth/guard': { requirePermissionResult: async permission => { assert.equal(permission, 'raffle'); return auth; } },
    '@/lib/supabase-paginate': load('lib/supabase-paginate.ts'),
    '@/lib/supabase-server': { createServerClient: () => ({ from(table) {
      assert.equal(table, 'raffle_orders'); reads++;
      const ordered = [];
      const chain = { select: () => chain, order: key => { ordered.push(key); return chain; }, range: async (from, to) => {
        assert.deepEqual(ordered, ['created_at', 'id']);
        return fail ? { data: null, error: { message: 'Private database detail' } } : { data: rows.slice(from, to + 1), error: null };
      } }; return chain;
    } }) },
  });
  assert.equal((await route.GET()).status, 401); assert.equal(reads, 0);
  auth = { user: null, status: 403, error: 'Forbidden' };
  assert.equal((await route.GET()).status, 403); assert.equal(reads, 0);
  auth = { user: { id: 'raffle-staff' }, status: 200 };
  const response = await route.GET(); assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal((await response.json()).orders.length, 1001);
  fail = true;
  const failed = await route.GET(); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /Private database detail/);
  console.log('PASS raffle filtering, paid-only totals, handovers, safe CSV, Melbourne dates, permission gates and 1001-order pagination');

  const React = require('react');
  const { act, create } = require('react-test-renderer');
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let unavailable = false, uiReads = 0;
  const Sales = load('components/raffle/RaffleSales.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/raffle-report': report,
    '@/lib/admin-client': {
      adminFetch: async () => { uiReads++; if (unavailable) throw new Error('Service unavailable'); return { orders }; },
      parseApiResponse: async value => value,
    },
    '@/components/ui/Button': { default: ({ children, ...props }) => React.createElement('button', props, children) },
    '@/components/ui/Input': { default: props => React.createElement('input', props) },
  }).default;
  const trailer = { id: 'trailer', code: 'NDCCRAF', name: 'Trailer raffle' };
  let tree;
  const shown = () => tree.root.findByProps({ role: 'status' }).children.join('');
  const exportButton = () => tree.root.findAllByType('button').find(button => button.children.join('') === 'Export shown sales (CSV)');
  await act(async () => { tree = create(React.createElement(Sales, { campaign: trailer })); });
  assert.equal(shown(), '4 of 4 orders shown');
  assert.equal(exportButton().props.disabled, false);
  await act(async () => tree.root.findByType('input').props.onChange({ target: { value: 'missing buyer' } }));
  assert.equal(shown(), '0 of 4 orders shown');
  assert.equal(exportButton().props.disabled, true);
  await act(async () => tree.update(React.createElement(Sales, { campaign: { id: 'reverse', code: 'NDCCREV', name: 'Reverse raffle' } })));
  assert.equal(shown(), '1 of 1 orders shown', 'Changing campaigns clears the previous search');
  unavailable = true;
  await act(async () => tree.update(React.createElement(Sales, { campaign: trailer, refreshKey: 1 })));
  assert.equal(uiReads, 2, 'Cash reconciliation refreshes the sales report');
  assert.match(tree.root.findByProps({ role: 'alert' }).children.join(''), /Previously loaded figures/);
  assert.equal(exportButton().props.disabled, true, 'Stale results cannot be exported');
  await act(async () => tree.unmount());
  await act(async () => { tree = create(React.createElement(Sales, { campaign: trailer })); });
  assert.equal(shown(), 'Sales unavailable');
  assert.ok(tree.root.findAllByType('dd').every(value => value.children.join('') === 'Unavailable'), 'A failed first load must not display zero sales');
  await act(async () => tree.unmount());
  console.log('PASS sales UI search, campaign changes, reconciliation refresh, export availability and failure states');
})().catch(error => { console.error(error); process.exitCode = 1; });
