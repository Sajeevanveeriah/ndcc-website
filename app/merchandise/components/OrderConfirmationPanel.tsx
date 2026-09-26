'use client';

import { CheckCircle2 } from 'lucide-react';
import BankTransferChoice from '@/components/payments/BankTransferChoice';
import Button from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import type { OrderConfirmation, PaymentCapabilities } from './types';

/** Post-order confirmation: reference, bank details, personalisation note and optional online card payment. */
export default function OrderConfirmationPanel({
  orderConfirmation,
  capabilities,
  cardPaying,
  cardAmount,
  setCardAmount,
  cardError,
  setCardError,
  startCardPayment,
}: {
  orderConfirmation: OrderConfirmation | null;
  capabilities: PaymentCapabilities;
  cardPaying: boolean;
  cardAmount: string;
  setCardAmount: (value: string) => void;
  cardError: string;
  setCardError: (value: string) => void;
  startCardPayment: (amount: number | null) => void;
}) {
  return (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg space-y-3" role="alert">
              <p className="text-green-800 dark:text-green-200 font-body font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                {orderConfirmation ? 'Order confirmed!' : 'Online payment submitted'}
              </p>
              {orderConfirmation?.payment_reference && (
                <div className="bg-surface-card border border-green-300 rounded-lg p-3">
                  <p className="text-green-900 dark:text-green-200 font-body text-sm font-semibold">Your order reference:</p>
                  <p className="text-green-900 dark:text-green-200 font-mono text-lg font-bold mt-1">{orderConfirmation.payment_reference}</p>
                  <p className="text-green-700 dark:text-green-300 font-body text-xs mt-1">Use this reference when making your bank transfer.</p>
                </div>
              )}
              {capabilities.bank_transfer && orderConfirmation?.bank_details?.bsb && (
                <div className="bg-surface-card border border-green-300 rounded-lg p-3">
                  <BankTransferChoice key={orderConfirmation.order_id} orderId={orderConfirmation.order_id} email={orderConfirmation.customer_email} />
                  <p className="text-green-900 dark:text-green-200 font-body text-sm font-semibold">Bank Transfer Details:</p>
                  <div className="mt-1 text-sm font-body text-green-800 dark:text-green-200 space-y-0.5">
                    <p>Account Name: <span className="font-semibold">{orderConfirmation.bank_details.account_name}</span></p>
                    <p>BSB: <span className="font-semibold">{orderConfirmation.bank_details.bsb}</span></p>
                    <p>Account Number: <span className="font-semibold">{orderConfirmation.bank_details.account_number}</span></p>
                  </div>
                </div>
              )}
              {orderConfirmation?.personalisation_requested && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  {orderConfirmation.number_requested
                    ? 'Your surname and number preferences have been recorded for club review. The club will confirm the final number by email, subject to availability.'
                    : 'Your surname has been recorded for club review.'}
                </div>
              )}
              {capabilities.card && orderConfirmation?.order_id && (
                <div className="bg-surface-card border border-green-300 rounded-lg p-3 space-y-2">
                  <p className="text-green-900 dark:text-green-200 font-body text-sm font-semibold">Prefer to pay online?</p>
                  <p className="text-green-800 dark:text-green-200 font-body text-xs">
                    Continue to Stripe Checkout instead of using bank transfer. Total: {formatCurrency(orderConfirmation.total_amount)}.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <Button
                      type="button"
                      size="sm"
                      isLoading={cardPaying}
                      onClick={() => startCardPayment(null)}
                    >
                      Pay full amount online
                    </Button>
                    {capabilities.partial_payments && (
                      <div className="flex items-end gap-2">
                        <div>
                          <label htmlFor="card-part-amount" className="form-label text-xs">
                            Part payment (min {formatCurrency(capabilities.minimum_partial_amount)})
                          </label>
                          <input
                            id="card-part-amount"
                            type="number"
                            inputMode="decimal"
                            min={capabilities.minimum_partial_amount}
                            max={orderConfirmation.total_amount}
                            step="0.01"
                            className="w-32 px-3 py-2 border border-edge-strong rounded-lg text-sm font-body focus:border-maroon-500 focus:ring-1 focus:ring-maroon-500 outline-none"
                            value={cardAmount}
                            onChange={(e) => setCardAmount(e.target.value)}
                            aria-describedby={cardError ? 'card-pay-error' : undefined}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          isLoading={cardPaying}
                          onClick={() => {
                            const amount = Number(cardAmount);
                            if (!Number.isFinite(amount) || amount <= 0) {
                              setCardError('Enter a valid part-payment amount.');
                              return;
                            }
                            startCardPayment(amount);
                          }}
                        >
                          Pay part online
                        </Button>
                      </div>
                    )}
                  </div>
                  {cardError && (
                    <p id="card-pay-error" className="text-red-700 dark:text-red-300 font-body text-xs" role="alert">{cardError}</p>
                  )}
                </div>
              )}
              <p className="text-green-700 dark:text-green-300 font-body text-sm">
                {orderConfirmation
                  ? 'Thank you for your order. It will be available for collection at the club once payment is confirmed.'
                  : 'Stripe has returned you to the club website. Your signed payment notification is being matched to the order before collection is approved.'}
              </p>
            </div>
  );
}
