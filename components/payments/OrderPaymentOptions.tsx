'use client';

import { useEffect, useState } from 'react';
import BankTransferChoice from './BankTransferChoice';
import BarPaymentChoice from './BarPaymentChoice';
import PayAtClubChoice from './PayAtClubChoice';
import Button from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';

type BankDetails = {
  account_name?: string | null;
  bsb?: string | null;
  account_number?: string | null;
} | null;

type PaymentCapabilities = {
  bank_transfer: boolean;
  card: boolean;
  pay_at_club?: boolean;
  partial_payments: boolean;
  minimum_partial_amount: number;
};

type OrderPaymentOptionsProps = {
  mealDraftToken?: string;
  mealRevision?: number;
  orderId: string;
  customerEmail: string;
  totalAmount: number;
  paymentReference: string;
  bankDetails: BankDetails;
  returnPath: string;
  /** Kitchen special request: the kitchen sets the final price, so only pay at the bar is offered. */
  barOnly?: boolean;
};

const DEFAULT_CAPABILITIES: PaymentCapabilities = {
  bank_transfer: false,
  card: false,
  pay_at_club: false,
  partial_payments: false,
  minimum_partial_amount: 10,
};

export default function OrderPaymentOptions({
  mealDraftToken,
  mealRevision,
  orderId,
  customerEmail,
  totalAmount,
  paymentReference,
  bankDetails,
  returnPath,
  barOnly = false,
}: OrderPaymentOptionsProps) {
  const [capabilities, setCapabilities] = useState<PaymentCapabilities>(DEFAULT_CAPABILITIES);
  const [cardPaying, setCardPaying] = useState(false);
  const [cardError, setCardError] = useState('');
  const [barSelected, setBarSelected] = useState(false);
  // One payment choice at a time: each control is locked while the other is
  // saving, and after either saves both re-read the stored choice, so the page
  // always shows what the server kept (a bar choice clears a bank choice and
  // the reverse).
  const [barBusy, setBarBusy] = useState(false);
  const [bankBusy, setBankBusy] = useState(false);
  const [choiceRefresh, setChoiceRefresh] = useState(0);
  const refreshChoices = () => setChoiceRefresh((value) => value + 1);

  useEffect(() => {
    let stale = false;

    void (async () => {
      try {
        const response = await fetch('/api/payments/capabilities', { cache: 'no-store' });
        const payload = await response.json();
        if (!stale && response.ok && payload?.data) {
          setCapabilities({ ...DEFAULT_CAPABILITIES, ...payload.data });
        }
      } catch {
        // Do not offer a payment method until the server confirms availability.
      }
    })();

    return () => {
      stale = true;
    };
  }, []);

  async function startCardPayment() {
    setCardPaying(true);
    setCardError('');

    try {
      const response = await fetch('/api/payments/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          ...(mealDraftToken ? { meal_draft_token: mealDraftToken, meal_revision: mealRevision } : {}),
          return_path: returnPath,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.checkout_url) {
        throw new Error(payload?.error || 'Card payment could not be started.');
      }
      window.location.href = payload.checkout_url;
    } catch (error) {
      setCardError(error instanceof Error ? error.message : 'Card payment could not be started.');
      setCardPaying(false);
    }
  }

  return (
    <section className="rounded-lg border border-green-300 bg-surface-card p-4 space-y-3" aria-label="Payment options">
      <h4 className="font-display font-bold text-green-900 dark:text-green-200">Payment options</h4>

      {paymentReference && (
        <div>
          <p className="text-sm font-semibold text-green-900 dark:text-green-200">Order reference</p>
          <p className="wrap-break-word font-mono text-lg font-bold text-green-900 dark:text-green-200">{paymentReference}</p>
        </div>
      )}

      {mealDraftToken && orderId && (
        <BarPaymentChoice key={orderId} orderId={orderId} draftToken={mealDraftToken} onChange={setBarSelected} disabled={bankBusy} refreshKey={choiceRefresh} onBusyChange={setBarBusy} onSaved={refreshChoices} required={barOnly} />
      )}

      {/* Every other order: pay at the club (cash or card at the bar), coordinated with the bank choice like the kitchen's bar choice. */}
      {!mealDraftToken && orderId && customerEmail && capabilities.pay_at_club && totalAmount > 0 && (
        <PayAtClubChoice key={orderId} orderId={orderId} email={customerEmail} onChange={setBarSelected} disabled={bankBusy} refreshKey={choiceRefresh} onBusyChange={setBarBusy} onSaved={refreshChoices} />
      )}

      {!barOnly && !barSelected && capabilities.bank_transfer && bankDetails?.bsb && bankDetails.account_number && (
        <div className="text-sm text-green-800 dark:text-green-200 space-y-0.5">
          <BankTransferChoice key={orderId} orderId={orderId} email={customerEmail} {...(mealDraftToken || capabilities.pay_at_club ? { disabled: barBusy, refreshKey: choiceRefresh, onBusyChange: setBankBusy, onSaved: refreshChoices } : {})} />
          <p className="font-semibold text-green-900 dark:text-green-200">Bank transfer details</p>
          {bankDetails.account_name && <p>Account name: {bankDetails.account_name}</p>}
          <p>BSB: {bankDetails.bsb}</p>
          <p>Account number: {bankDetails.account_number}</p>
        </div>
      )}

      {!barOnly && capabilities.card && orderId && totalAmount > 0 && (
        <div className="space-y-2">
          <Button type="button" isLoading={cardPaying} onClick={startCardPayment}>
            Pay {formatCurrency(totalAmount)} securely online
          </Button>
        </div>
      )}

      {cardError && (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {cardError}
        </p>
      )}
    </section>
  );
}
