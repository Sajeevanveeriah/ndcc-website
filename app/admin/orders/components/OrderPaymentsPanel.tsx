'use client';

import type { Dispatch, SetStateAction } from 'react';
import { formatDate, formatCurrency } from '@/lib/utils';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import { Select } from '@/components/ui/Input';
import { TableRow, TableCell } from '@/components/ui/Table';
import { MANUAL_PAYMENT_LIMITS } from '@/lib/payments/manual-payment';
import { PAYMENT_METHODS, type AdminOrder, type OrderPayment, type PaymentFormState } from './shared';

/** Expanded per-order payment history and manual payment entry row. */
export default function OrderPaymentsPanel({
  order: o,
  orderPayments,
  paymentForm,
  setPaymentForm,
  savingPayment,
  onRecordPayment,
  onReversePayment,
}: {
  order: AdminOrder;
  orderPayments: OrderPayment[];
  paymentForm: PaymentFormState;
  setPaymentForm: Dispatch<SetStateAction<PaymentFormState>>;
  savingPayment: boolean;
  onRecordPayment: (order: AdminOrder) => void;
  onReversePayment: (payment: OrderPayment) => void;
}) {
  return (
                <TableRow>
                  <TableCell colSpan={8}>
                    <div className="space-y-4 py-2">
                      <div>
                        <h3 className="font-display font-bold text-sm text-content-primary mb-2">Payment history</h3>
                        {orderPayments.length === 0 ? (
                          <p className="text-xs text-content-muted">No payments recorded yet.</p>
                        ) : (
                          <ul className="space-y-1">
                            {orderPayments.map((p) => (
                              <li key={p.id} className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-mono">{formatDate(p.received_at || p.created_at)}</span>
                                <span className="font-semibold">{formatCurrency(p.amount)}</span>
                                <span>{p.method}</span>
                                {o.payment_reference && <span className="font-mono text-content-muted">Order / receipt: {o.payment_reference}</span>}
                                {p.payment_reference && <details className="text-content-muted"><summary className="cursor-pointer">Transaction details</summary><span className="font-mono">{p.payment_reference}</span></details>}
                                <Badge variant={p.status === 'settled' ? 'success' : p.status === 'refunded' ? 'default' : p.status === 'void' ? 'default' : 'warning'}>
                                  {p.status}
                                </Badge>
                                {p.provider_reference && <span className="font-mono text-content-muted">Provider: {p.provider_reference}</span>}
                                {p.recorded_by && <span className="text-content-muted">by {p.recorded_by}</span>}
                                {p.notes && <span className="text-content-muted">— {p.notes}</span>}
                                {p.status === 'settled' && p.provider !== 'stripe' && (
                                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => onReversePayment(p)}>
                                    Reverse
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="w-44">
                          <Select
                            id={`method-${o.id}`}
                            label="Payment method"
                            options={PAYMENT_METHODS}
                            value={paymentForm.method}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}
                          />
                        </div>
                        <div className="w-36">
                          <Input
                            id={`amount-${o.id}`}
                            label="Amount ($)"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={paymentForm.amount}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                          />
                        </div>
                        <div className="w-64">
                          <Input
                            id={`notes-${o.id}`}
                            label="Notes (optional)"
                            value={paymentForm.notes}
                            maxLength={MANUAL_PAYMENT_LIMITS.notesLength}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                          />
                        </div>
                        <Button size="sm" isLoading={savingPayment} onClick={() => onRecordPayment(o)}>
                          Record Payment
                        </Button>
                      </div>
                      <p className="text-xs text-content-muted">
                        Card payments are recorded automatically by the Stripe webhook. Corrections are reversing
                        entries — payment history is never edited or deleted.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
  );
}
