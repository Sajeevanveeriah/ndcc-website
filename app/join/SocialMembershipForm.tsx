'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import Input, { Textarea } from '@/components/ui/Input';
import OrderPaymentOptions from '@/components/payments/OrderPaymentOptions';
import { formatCurrency } from '@/lib/utils';
import type { MembershipAddonOption, MembershipPlanOption } from '@/lib/public-form-options';

type OrderConfirmation = {
  order_id: string;
  total_amount: number;
  payment_reference: string;
  bank_details: { account_name: string; bsb: string; account_number: string } | null;
};

// Client island for the social membership application: plan/add-on
// selection, honeypot, submission and payment options. Plans and add-ons are
// read server-side by the page and passed in.
export default function SocialMembershipForm({ plans, addons }: { plans: MembershipPlanOption[]; addons: MembershipAddonOption[] }) {
  const [selectedPlan, setSelectedPlan] = useState(plans[0]?.id || '');
  const [selectedAddons, setSelectedAddons] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({ full_name: '', email: '', phone: '', notes: '', hp_field: '', submitted_at: Date.now() });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);

  const isPotClub = plans.find(p => p.id === selectedPlan)?.product_code === 'pot_club_2026_27';
  const total = useMemo(() => {
    const planPrice = plans.find((p) => p.id === selectedPlan)?.price || 0;
    const addonTotal = isPotClub ? 0 : addons.filter((a) => selectedAddons[a.id]).reduce((sum, a) => sum + a.price, 0);
    return planPrice + addonTotal;
  }, [plans, addons, selectedPlan, selectedAddons, isPotClub]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || orderConfirmation) return;
    setLoading(true);
    setSubmitStatus('idle');
    setMessage('');
    setOrderConfirmation(null);

    const payload = {
      ...formData,
      membership_plan_id: selectedPlan,
      addons: isPotClub ? [] : Object.keys(selectedAddons).filter((id) => selectedAddons[id]).map((addon_id) => ({ addon_id, quantity: 1 })),
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
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <fieldset disabled={loading || Boolean(orderConfirmation)} className="space-y-5">
          <input type="text" className="hidden" value={formData.hp_field} onChange={(e) => setFormData((p) => ({ ...p, hp_field: e.target.value }))} />
          <Input id="full_name" label="Full name" value={formData.full_name} onChange={(e) => setFormData((p) => ({ ...p, full_name: e.target.value }))} required />
          <Input id="email" label="Email" type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} required />
          <Input id="phone" label="Phone" value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} />

          <div>
            <label htmlFor="membership_plan" className="form-label">Membership Plan</label>
            <select id="membership_plan" className="form-input" value={selectedPlan} onChange={(e) => { setSelectedPlan(e.target.value); setSelectedAddons({}); }}>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} - {formatCurrency(plan.price)}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            {!isPotClub && addons.length > 0 && <p className="form-label">Optional Add-ons</p>}
            {(isPotClub ? [] : addons).map((addon) => (
              <label key={addon.id} className="flex items-center justify-between gap-3 border border-edge-strong rounded-lg px-4 py-3 font-body text-content-primary cursor-pointer transition-colors hover:border-maroon-300 has-[:checked]:border-maroon-500 has-[:checked]:bg-maroon-50/50 dark:border-slate-600 dark:text-slate-100">
                <span>{addon.name} {addon.usage_limit ? `(limit ${addon.usage_limit})` : ''}</span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold">{formatCurrency(addon.price)}</span>
                  <input type="checkbox" className="h-4 w-4 accent-maroon-700" checked={Boolean(selectedAddons[addon.id])} onChange={(e) => setSelectedAddons((p) => ({ ...p, [addon.id]: e.target.checked }))} />
                </span>
              </label>
            ))}
          </div>

          <Textarea id="notes" label={isPotClub ? "Engraving preference / notes (optional)" : "Notes"} value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} />
          <p className="font-display text-lg font-bold text-maroon-800 dark:text-maroon-200 border-t border-edge-subtle pt-4">Estimated Total: {formatCurrency(total)}</p>
          </fieldset>
          <p className="text-sm">Your details are used to process this application and payment. Read our <Link href="/privacy" className="underline">privacy statement</Link>.</p>
          <Button type="submit" isLoading={loading} disabled={plans.length === 0 || Boolean(orderConfirmation)}>{loading ? 'Submitting...' : isPotClub ? 'Order Pot Club pot' : 'Submit Social Membership'}</Button>
          {submitStatus === 'success' && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3" role="alert">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-700 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-green-800 font-body font-semibold">Application submitted</p>
                  <p className="text-green-700 font-body text-sm mt-1">{message}</p>
                </div>
              </div>
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
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3" role="alert">
              <XCircle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-red-800 font-body font-semibold">Something went wrong</p>
                <p className="text-red-700 font-body text-sm mt-1">{message}</p>
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
