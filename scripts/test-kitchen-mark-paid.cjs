// Kitchen page "Mark Paid" / "Mark Unpaid": online orders are paid through the
// order ledger (cash), with the customer receipt and staff paid email, so the
// export and Admin > Orders agree; recorded payments are never erased here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
class NextResponse extends Response { static json(body, init) { return new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); } }

let user, kitchen, order, rpcCalls, updates, receipts, staff, rpcFails, paymentMeta;
const reset = () => {
  user = { id: 'admin-1', email: 'admin@example.invalid', role: 'admin' };
  kitchen = { id: 'k-1', linked_order_id: 'o-1', payment_status: 'pending_bank_transfer', processed: false };
  order = { id: 'o-1', total_amount: 18, amount_paid: 0, balance_due: 18, payment_status: 'pending_bank_transfer', order_status: 'submitted', deleted_at: null };
  rpcCalls = []; updates = []; receipts = []; staff = []; rpcFails = false; paymentMeta = { source: 'kitchen' };
};
const db = {
  from(table) { const filters = {}; let patch = null; const q = {
    select: () => q, update: value => { patch = value; return q; },
    eq: (k, v) => { filters[k] = v; if (patch) { updates.push({ table, patch, filters: { ...filters } }); if (table === 'kitchen_orders') Object.assign(kitchen, patch); return Promise.resolve({ error: null }); } return q; },
    maybeSingle: async () => {
      if (table === 'kitchen_orders') return { data: filters.id === kitchen.id ? { ...kitchen } : null, error: null };
      if (table === 'orders') return { data: filters.id === order.id ? { ...order } : null, error: null };
      if (table === 'order_payments') return { data: { id: filters.id, metadata: paymentMeta }, error: null };
      throw new Error(`Unexpected table ${table}`);
    },
  }; return q; },
  async rpc(name, args) {
    rpcCalls.push({ name, args });
    if (rpcFails) return { data: null, error: { message: 'no unreserved balance' } };
    // The ledger settles the payment; the orders trigger then syncs the kitchen row.
    order = { ...order, amount_paid: args.target_amount_cents / 100, balance_due: 0, payment_status: 'paid' };
    kitchen.payment_status = 'paid';
    return { data: [{ payment_id: 'pay-1', replayed: false }], error: null };
  },
};
const cache = new Map();
function load(file, mocks) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, console: { ...console, error: () => {} }, Request, Response, Headers, URL, require(name) { if (name in mocks) return mocks[name]; if (name.startsWith('@/')) return load(path.resolve(name.slice(2) + '.ts'), mocks); return require(name); } }, { filename: file });
  return exports;
}
const mocks = {
  'next/server': { NextResponse }, 'server-only': {},
  '@/lib/auth/guard': { requirePermission: async (permission, roles) => (permission === 'kitchen' && roles?.includes(user?.role) ? user : null) },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/payments/receipt-delivery': {
    enqueuePaymentReceiptJob: async (_db, kind, id) => { receipts.push({ kind, id }); return { ok: true, jobId: 'job-1' }; },
    attemptPaymentReceiptDelivery: async () => ({ status: 'delivered' }),
  },
  '@/lib/order-notifications': { sendPaidStaffOrderNotificationForPayment: async (_db, payment, orderId) => { staff.push({ payment, orderId }); return { status: 'sent' }; } },
};
const route = load(path.resolve('app/api/admin/kitchen/orders/route.ts'), mocks);
const patchReq = body => route.PATCH(new Request('https://example.invalid/api/admin/kitchen/orders', { method: 'PATCH', body: JSON.stringify(body) }));

(async () => {
  // 1. Mark Paid records the balance as cash in the ledger, sends the receipt and the staff paid email.
  reset();
  let res = await patchReq({ id: 'k-1', payment_status: 'paid' });
  let body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'record_manual_order_payment');
  assert.equal(rpcCalls[0].args.target_order_id, 'o-1');
  assert.equal(rpcCalls[0].args.target_amount_cents, 1800);
  assert.equal(rpcCalls[0].args.target_method, 'cash');
  assert.equal(rpcCalls[0].args.target_recorded_by, 'admin@example.invalid');
  assert.match(rpcCalls[0].args.target_operation_id, /^[0-9a-f-]{36}$/);
  assert.equal(JSON.stringify(receipts), JSON.stringify([{ kind: 'order_payment', id: 'pay-1' }]), 'customer receipt with the staff copy');
  assert.equal(staff.length, 1); assert.equal(staff[0].orderId, 'o-1'); assert.equal(JSON.stringify(staff[0].payment), JSON.stringify({ id: 'pay-1', metadata: paymentMeta }));
  assert.equal(body.customer_receipt_status, 'delivered'); assert.equal(body.staff_notification_status, 'sent'); assert.equal(body.already_paid, false);
  assert.ok(!updates.some(u => u.table === 'kitchen_orders' && 'payment_status' in u.patch), 'kitchen row is synced by the orders trigger, not written directly');
  assert.equal(order.payment_status, 'paid'); assert.equal(kitchen.payment_status, 'paid');

  // 2. A second click (already paid) records nothing and sends nothing.
  res = await patchReq({ id: 'k-1', payment_status: 'paid' }); body = await res.json();
  assert.equal(res.status, 200); assert.equal(body.already_paid, true);
  assert.equal(rpcCalls.length, 1); assert.equal(receipts.length, 1); assert.equal(staff.length, 1);

  // 3. Partial payment: only the remaining balance is recorded.
  reset(); order = { ...order, amount_paid: 5, balance_due: 13 };
  await patchReq({ id: 'k-1', payment_status: 'paid' });
  assert.equal(rpcCalls[0].args.target_amount_cents, 1300);
  reset(); order = { ...order, balance_due: null, amount_paid: 10 };
  await patchReq({ id: 'k-1', payment_status: 'paid' });
  assert.equal(rpcCalls[0].args.target_amount_cents, 800, 'falls back to total less amount paid');

  // 4. Ledger refusal (e.g. a concurrent payment) returns 409 with no receipt or email.
  reset(); rpcFails = true;
  res = await patchReq({ id: 'k-1', payment_status: 'paid' });
  assert.equal(res.status, 409); assert.equal(receipts.length, 0); assert.equal(staff.length, 0);
  assert.equal(order.payment_status, 'pending_bank_transfer');

  // 5. Cancelled or deleted orders are refused.
  reset(); order.order_status = 'cancelled';
  assert.equal((await patchReq({ id: 'k-1', payment_status: 'paid' })).status, 409); assert.equal(rpcCalls.length, 0);
  reset(); order.deleted_at = '2026-09-30T00:00:00Z';
  assert.equal((await patchReq({ id: 'k-1', payment_status: 'paid' })).status, 404); assert.equal(rpcCalls.length, 0);

  // 6. Mark Unpaid never erases a recorded payment.
  reset(); order = { ...order, payment_status: 'paid', amount_paid: 18, balance_due: 0 }; kitchen.payment_status = 'paid';
  res = await patchReq({ id: 'k-1', payment_status: 'pending_bank_transfer' }); body = await res.json();
  assert.equal(res.status, 409); assert.match(body.error, /Reverse it in Admin > Orders/);
  assert.equal(updates.length, 0); assert.equal(kitchen.payment_status, 'paid');
  // ...and is a harmless no-op on an unpaid order.
  reset();
  assert.equal((await patchReq({ id: 'k-1', payment_status: 'pending_bank_transfer' })).status, 200);
  assert.ok(!updates.some(u => 'payment_status' in u.patch));

  // 7. Legacy kitchen rows with no online order keep the simple switch.
  reset(); kitchen.linked_order_id = null;
  assert.equal((await patchReq({ id: 'k-1', payment_status: 'paid' })).status, 200);
  assert.equal(rpcCalls.length, 0); assert.equal(kitchen.payment_status, 'paid');

  // 8. Other fields are unchanged; unknown rows 404; non-admins refused.
  reset();
  assert.equal((await patchReq({ id: 'k-1', processed: true })).status, 200); assert.equal(kitchen.processed, true); assert.equal(rpcCalls.length, 0);
  assert.equal((await patchReq({ id: 'k-9', payment_status: 'paid' })).status, 404);
  assert.equal((await patchReq({ id: 'k-1' })).status, 400);
  user = { id: 'c-1', role: 'committee' };
  assert.equal((await patchReq({ id: 'k-1', payment_status: 'paid' })).status, 403); assert.equal(rpcCalls.length, 0);
  console.log('PASS: kitchen Mark Paid records cash in the ledger with receipt and staff email, never pays twice, refuses erasing payments, keeps legacy rows and permissions.');
})().catch(error => { console.error(error); process.exit(1); });
