'use client';

import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input, { Textarea } from '@/components/ui/Input';
import type { MerchandiseWindow, MerchPaymentMethod, PaymentCapabilities } from './types';

export type CheckoutFormData = {
  name: string;
  email: string;
  phone: string;
  notes: string;
  hp_field: string;
  submitted_at: number;
};

/** Customer details, payment method choice and order submission. */
export default function CheckoutForm({
  formData,
  setFormData,
  formErrors,
  handleSubmit,
  capabilities,
  paymentMethod,
  setPaymentMethod,
  isSubmitting,
  windowState,
  securityCheck,
}: {
  formData: CheckoutFormData;
  setFormData: Dispatch<SetStateAction<CheckoutFormData>>;
  formErrors: Record<string, string>;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  capabilities: PaymentCapabilities;
  paymentMethod: MerchPaymentMethod;
  setPaymentMethod: (method: MerchPaymentMethod) => void;
  isSubmitting: boolean;
  windowState: { processing_open: boolean; queue_allowed: boolean; current_window: MerchandiseWindow | null; next_window: MerchandiseWindow | null };
  /** Optional bot check (Turnstile) rendered just above the submit button. */
  securityCheck?: ReactNode;
}) {
  return (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-display font-bold text-content-primary text-lg mb-4">
                    Your Details
                  </h3>
                  <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <input
                      type="text"
                      name="website"
                      value={formData.hp_field}
                      onChange={(e) => setFormData((prev) => ({ ...prev, hp_field: e.target.value }))}
                      className="hidden"
                      tabIndex={-1}
                      autoComplete="off"
                    />
                    <Input
                      id="merch_name"
                      label="Full Name"
                      type="text"
                      required
                      placeholder="e.g. Jane Smith"
                      value={formData.name}
                      error={formErrors.name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        id="merch_email"
                        label="Email Address"
                        type="email"
                        required
                        placeholder="e.g. jane@example.com"
                        value={formData.email}
                        error={formErrors.email}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, email: e.target.value }))
                        }
                      />

                      <Input
                        id="merch_phone"
                        label="Phone Number"
                        type="tel"
                        required
                        placeholder="e.g. 0412 345 678"
                        value={formData.phone}
                        error={formErrors.phone}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, phone: e.target.value }))
                        }
                      />
                    </div>

                    <Textarea
                      id="merch_notes"
                      label="Notes (optional)"
                      placeholder="Any special requests or notes..."
                      rows={3}
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, notes: e.target.value }))
                      }
                    />

                    {(capabilities.card || capabilities.bank_transfer || capabilities.pay_at_club) && (
                      <fieldset className="space-y-2">
                        <legend className="form-label">Payment method</legend>
                        {capabilities.bank_transfer && <label className="flex min-h-11 items-center gap-3 rounded-lg border border-edge-strong px-3 py-2">
                          <input
                            type="radio"
                            name="payment_method"
                            value="bank_transfer"
                            checked={paymentMethod === 'bank_transfer'}
                            onChange={() => setPaymentMethod('bank_transfer')}
                          />
                          Bank transfer (bank deposit)
                        </label>}
                        {capabilities.card && <label className="flex min-h-11 items-center gap-3 rounded-lg border border-edge-strong px-3 py-2">
                          <input
                            type="radio"
                            name="payment_method"
                            value="stripe"
                            checked={paymentMethod === 'stripe'}
                            onChange={() => setPaymentMethod('stripe')}
                          />
                          Pay securely by card with Stripe
                        </label>}
                        {capabilities.pay_at_club && <label className="flex min-h-11 items-center gap-3 rounded-lg border border-edge-strong px-3 py-2">
                          <input
                            type="radio"
                            name="payment_method"
                            value="pay_at_club"
                            checked={paymentMethod === 'pay_at_club'}
                            onChange={() => setPaymentMethod('pay_at_club')}
                          />
                          Pay at the club (cash or card at the bar)
                        </label>}
                      </fieldset>
                    )}

                    {securityCheck}

                    <Button
                      type="submit"
                      isLoading={isSubmitting}
                      size="lg"
                      className="w-full"
                      disabled={!windowState.processing_open && !windowState.queue_allowed}
                    >
                      {isSubmitting
                        ? 'Submitting order...'
                        : !windowState.processing_open && !windowState.queue_allowed
                          ? 'Ordering Closed'
                          : !windowState.processing_open
                            ? 'Queue Order for Next Window'
                            : paymentMethod === 'stripe'
                              ? 'Place Order and Pay by Card'
                              : paymentMethod === 'pay_at_club'
                                ? 'Place Order (Pay at the Club)'
                                : 'Place Order (Bank Transfer)'}
                    </Button>

                    <p className="text-content-muted font-body text-xs text-center">
                      {paymentMethod === 'stripe'
                        ? 'After submission you will continue to Stripe Checkout.'
                        : paymentMethod === 'pay_at_club'
                          ? 'After submission you will receive an order reference to quote when you pay at the bar.'
                          : 'After submission you will receive a payment reference for bank transfer.'}
                    </p>
                    <p className="text-content-muted font-body text-xs text-center">
                      Order reference format: NDCCMER-YYYY-000001
                    </p>
                  </form>
                </CardContent>
              </Card>
  );
}
