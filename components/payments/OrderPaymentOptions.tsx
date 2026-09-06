'use client';

import { useEffect, useState } from 'react';
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
  partial_payments: boolean;
  minimum_partial_amount: number;
};

type OrderPaymentOptionsProps = {
  orderId: string;
  totalAmount: number;
  paymentReference: string;
  bankDetails: BankDetails;
  returnPath: string;
};

const DEFAULT_CAPABILITIES: PaymentCapabilities = {
  bank_transfer: true,
  card: false,
  partial_payments: false,
  minimum_partial_amount: 10,
};

export default function OrderPaymentOptions({
  orderId,
  totalAmount,
  paymentReference,
  bankDetails,
  returnPath,
}: OrderPaymentOptionsProps) {
  const [capabilities, setCapabilities] = useState<PaymentCapabilities>(DEFAULT_CAPABILITIES);
  const [cardPaying, setCardPaying] = useState(false);
  const [cardError, setCardError] = useState('');

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
        // Keep the bank-transfer-only fallback when capability discovery fails.
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
          <p className="break-words font-mono text-lg font-bold text-green-900 dark:text-green-200">{paymentReference}</p>
        </div>
      )}

      {capabilities.bank_transfer && bankDetails?.bsb && bankDetails.account_number && (
        <div className="text-sm text-green-800 dark:text-green-200 space-y-0.5">
          <p className="font-semibold text-green-900 dark:text-green-200">Bank transfer</p>
          {bankDetails.account_name && <p>Account name: {bankDetails.account_name}</p>}
          <p>BSB: {bankDetails.bsb}</p>
          <p>Account number: {bankDetails.account_number}</p>
        </div>
      )}

      {capabilities.card && orderId && totalAmount > 0 && (
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
