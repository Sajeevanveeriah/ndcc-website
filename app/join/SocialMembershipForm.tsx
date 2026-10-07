'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input, { Textarea } from '@/components/ui/Input';
import OrderPaymentOptions from '@/components/payments/OrderPaymentOptions';
import TurnstileWidget, { useTurnstile } from '@/components/common/TurnstileWidget';
import { formatCurrency } from '@/lib/utils';
import { SOCIAL_MEMBERSHIP_ELIGIBILITY } from '@/lib/social-membership';
import { DEFAULT_POT_CLUB_PRODUCT_CODE } from '@/lib/pot-club';
import type { MembershipAddonOption, MembershipPlanOption } from '@/lib/public-form-options';

// Shown wherever a social membership buyer can see it before paying: beside
// the plan choice and again with the payment options.
function EligibilityNote({ id }: { id?: string }) {
  return (
    <p id={id} className="flex items-start gap-2 rounded-lg border border-sky_accent/60 bg-surface-blue-subtle px-3 py-2 text-sm font-semibold text-content-blue">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {SOCIAL_MEMBERSHIP_ELIGIBILITY}
    </p>
  );
}

type OrderConfirmation = {
  order_id: string;
  total_amount: number;
  payment_reference: string;
  bank_details: { account_name: string; bsb: string; account_number: string } | null;
};

// Client island for the social membership application: plan/add-on
// selection, honeypot, submission and payment options. Plans and add-ons are
// read server-side by the page and passed in. `heading` is optional content
// rendered at the top of the card (the join page passes its step heading).
export default function SocialMembershipForm({ plans, addons, potClubProductCode = DEFAULT_POT_CLUB_PRODUCT_CODE, heading }: { plans: MembershipPlanOption[]; addons: MembershipAddonOption[]; potClubProductCode?: string; heading?: ReactNode }) {
  const [selectedPlan, setSelectedPlan] = useState(plans[0]?.id || '');
  const [selectedAddons, setSelectedAddons] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({ full_name: '', email: '', phone: '', notes: '', hp_field: '', submitted_at: Date.now() });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const turnstile = useTurnstile();

  // The Pot Club plan is the one selected in the CMS (/admin/promotions).
  const isPotClub = plans.find(p => p.id === selectedPlan)?.product_code === potClubProductCode;
  const total = useMemo(() => {
    const planPrice = plans.find((p) => p.id === selectedPlan)?.price || 0;
    const addonTotal = isPotClub ? 0 : addons.filter((a) => selectedAddons[a.id]).reduce((sum, a) => sum + a.price, 0);
    return planPrice + addonTotal;
  }, [plans, addons, selectedPlan, selectedAddons, isPotClub]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || orderConfirmation) return;
    if (!turnstile.check()) return;
    setLoading(true);
    setSubmitStatus('idle');
    setMessage('');
    setOrderConfirmation(null);

    const payload = {
      ...formData,
      membership_plan_id: selectedPlan,
      pot_club: isPotClub,
      addons: isPotClub ? [] : Object.keys(selectedAddons).filter((id) => selectedAddons[id]).map((addon_id) => ({ addon_id, quantity: 1 })),
      turnstileToken: turnstile.token ?? undefined,
    };

    try {
      const res = await fetch('/api/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        setSubmitStatus('success');
        setMessage(isPotClub ? 'Your Pot Club order has been submitted. Choose your payment option below.' : 'Your social membership application has been submitted.');
        setOrderConfirmation({
          order_id: data.order_id || '',
          total_amount: Number(data.total_amount || 0),
          payment_reference: data.payment_reference || '',
          bank_details: data.bank_details || null,
        });

      } else {
        setSubmitStatus('error');
        setMessage(data.error || 'Unable to submit membership application.');
      }
    } catch {
      setSubmitStatus('error');
      setMessage('Unable to submit membership application. Please check your connection and try again.');
    } finally {
      setLoading(false);
      turnstile.reset();
    }
  };

  return (
    <div className="nd-card min-w-0 p-5 sm:p-[26px]">
        {heading}
        <form onSubmit={submit} className="space-y-5">
          <fieldset disabled={loading || Boolean(orderConfirmation)} className="min-w-0 space-y-4 pt-4">
          <input type="text" className="hidden" value={formData.hp_field} onChange={(e) => setFormData((p) => ({ ...p, hp_field: e.target.value }))} />
          <Input id="full_name" label="Full name" value={formData.full_name} onChange={(e) => setFormData((p) => ({ ...p, full_name: e.target.value }))} required />
          <Input id="email" label="Email" type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} required />
          <Input id="phone" label="Phone" value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} />

          <div>
            <label htmlFor="membership_plan" className="form-label">Membership Plan</label>
            <select id="membership_plan" className="form-input" aria-describedby={isPotClub ? undefined : 'membership-eligibility'} value={selectedPlan} onChange={(e) => { setSelectedPlan(e.target.value); setSelectedAddons({}); }}>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} - {formatCurrency(plan.price)}</option>)}
            </select>
            {!isPotClub && <div className="mt-2"><EligibilityNote id="membership-eligibility" /></div>}
          </div>

          <div className="space-y-2">
            {!isPotClub && addons.length > 0 && <p className="form-label">Optional Add-ons</p>}
            {(isPotClub ? [] : addons).map((addon) => (
              <label key={addon.id} className="flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-edge-subtle bg-surface-card px-4 py-3 font-body text-content-primary cursor-pointer transition-colors hover:border-edge-strong has-checked:border-maroon-700 has-checked:bg-maroon-50/50 dark:text-slate-100 dark:has-checked:border-maroon-300 dark:has-checked:bg-maroon-950/40">
                <span>{addon.name} {addon.usage_limit ? `(limit ${addon.usage_limit})` : ''}</span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold">{formatCurrency(addon.price)}</span>
                  <input type="checkbox" className="h-4 w-4 accent-maroon-700" checked={Boolean(selectedAddons[addon.id])} onChange={(e) => setSelectedAddons((p) => ({ ...p, [addon.id]: e.target.checked }))} />
                </span>
              </label>
            ))}
          </div>

          <Textarea id="notes" label={isPotClub ? "Engraving preference / notes (optional)" : "Notes"} value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} />
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-edge-subtle pt-4 font-display text-lg font-semibold text-content-primary"><span>Estimated Total:</span> <span className="text-maroon-800 dark:text-maroon-200">{formatCurrency(total)}</span></p>
          </fieldset>
          <p className="text-sm text-content-muted">Your details are used to process this application and payment. Read our <Link href="/privacy" className="font-semibold text-maroon-700 underline underline-offset-2 dark:text-maroon-200">privacy statement</Link>.</p>
          {!orderConfirmation && <TurnstileWidget onToken={turnstile.setToken} resetKey={turnstile.resetKey} action="membership" message={turnstile.message} />}
          <Button type="submit" className="w-full" isLoading={loading} disabled={plans.length === 0 || Boolean(orderConfirmation)}>{loading ? 'Submitting...' : isPotClub ? 'Order Pot Club pot' : 'Submit Social Membership'}</Button>
          {submitStatus === 'success' && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-2xl space-y-3 dark:bg-green-950/40 dark:border-green-800" role="alert">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-700 mt-0.5 shrink-0 dark:text-green-300" aria-hidden="true" />
                <div>
                  <p className="text-green-800 font-body font-semibold dark:text-green-200">Application submitted</p>
                  <p className="text-green-700 font-body text-sm mt-1 dark:text-green-300">{message}</p>
                </div>
              </div>
              {!isPotClub && <EligibilityNote />}
              {orderConfirmation?.order_id && orderConfirmation.total_amount > 0 && (
                <OrderPaymentOptions
                  orderId={orderConfirmation.order_id}
                  customerEmail={formData.email}
                  totalAmount={orderConfirmation.total_amount}
                  paymentReference={orderConfirmation.payment_reference}
                  bankDetails={orderConfirmation.bank_details}
                  returnPath="/join"
                />
              )}
            </div>
          )}
          {submitStatus === 'error' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 dark:bg-red-950/40 dark:border-red-800" role="alert">
              <XCircle className="h-5 w-5 text-red-700 mt-0.5 shrink-0 dark:text-red-300" aria-hidden="true" />
              <div>
                <p className="text-red-800 font-body font-semibold dark:text-red-200">Something went wrong</p>
                <p className="text-red-700 font-body text-sm mt-1 dark:text-red-300">{message}</p>
              </div>
            </div>
          )}
        </form>
    </div>
  );
}
