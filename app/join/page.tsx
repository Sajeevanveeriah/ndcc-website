'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import Card, { CardContent } from '@/components/ui/Card';
import Input, { Textarea } from '@/components/ui/Input';
import OrderPaymentOptions from '@/components/payments/OrderPaymentOptions';
import { formatCurrency } from '@/lib/utils';
import { fallbackMembershipAddons, fallbackMembershipPlans } from '@/lib/fallback-content';
import { PLAYHQ_ORG_URL } from '@/lib/constants';
import Accordion from '@/components/common/Accordion';

interface Plan { id: string; name: string; description: string; price: number; }
interface Addon { id: string; name: string; description: string; price: number; usage_limit: number | null; }

type OrderConfirmation = {
  order_id: string;
  total_amount: number;
  payment_reference: string;
  bank_details: { account_name: string; bsb: string; account_number: string } | null;
};

export default function JoinPage() {
  const [plans, setPlans] = useState<Plan[]>(fallbackMembershipPlans);
  const [addons, setAddons] = useState<Addon[]>(fallbackMembershipAddons);
  const [selectedPlan, setSelectedPlan] = useState(fallbackMembershipPlans[0]?.id || '');
  const [selectedAddons, setSelectedAddons] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({ full_name: '', email: '', phone: '', notes: '', hp_field: '', submitted_at: Date.now() });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [heroTitle, setHeroTitle] = useState('Join the Club');
  const [heroBody, setHeroBody] = useState('Choose player registration via PlayHQ or apply for social membership below.');

  useEffect(() => {
    const load = async () => {
      try {
        const membershipRes = await fetch('/api/memberships', { cache: 'no-store' });
        const data = await membershipRes.json();
        if (membershipRes.ok && Array.isArray(data.plans) && data.plans.length > 0) {
          setPlans(data.plans);
          setSelectedPlan(data.plans[0].id);
        }
        if (membershipRes.ok && Array.isArray(data.addons) && data.addons.length > 0) {
          setAddons(data.addons);
        }
      } catch {
        setPlans(fallbackMembershipPlans);
        setAddons(fallbackMembershipAddons);
        setSelectedPlan(fallbackMembershipPlans[0]?.id || '');
      }

      try {
        const contentRes = await fetch('/api/content-blocks?keys=join.hero', { cache: 'no-store' });
        const contentData = await contentRes.json();
        const block = (contentData.data || []).find((b: { block_key: string }) => b.block_key === 'join.hero');
        if (block?.title) setHeroTitle(block.title);
        if (block?.body) setHeroBody(block.body);
      } catch {
        // Fallback copy remains in state.
      }
    };
    load();
  }, []);

  const total = useMemo(() => {
    const planPrice = plans.find((p) => p.id === selectedPlan)?.price || 0;
    const addonTotal = addons.filter((a) => selectedAddons[a.id]).reduce((sum, a) => sum + a.price, 0);
    return planPrice + addonTotal;
  }, [plans, addons, selectedPlan, selectedAddons]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSubmitStatus('idle');
    setMessage('');
    setOrderConfirmation(null);

    const payload = {
      ...formData,
      membership_plan_id: selectedPlan,
      addons: Object.keys(selectedAddons).filter((id) => selectedAddons[id]).map((addon_id) => ({ addon_id, quantity: 1 })),
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
        setMessage('Your social membership application has been submitted.');
        setOrderConfirmation({
          order_id: data.order_id || '',
          total_amount: Number(data.total_amount || 0),
          payment_reference: data.payment_reference || '',
          bank_details: data.bank_details || null,
        });
        setFormData({ full_name: '', email: '', phone: '', notes: '', hp_field: '', submitted_at: Date.now() });
        setSelectedAddons({});
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
    <>
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">{heroTitle}</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">{heroBody}</p></ScrollReveal>
        </div>
      </section>
      <div className="container-width px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        <ScrollReveal stagger className="grid md:grid-cols-2 gap-6">
          <ScrollRevealItem>
            <Card>
              <CardContent className="p-6 space-y-3">
                <h2 className="text-2xl font-display font-bold">Player Registration</h2>
                <p className="text-content-muted">Player registrations stay on PlayHQ as required.</p>
                <a href={PLAYHQ_ORG_URL} target="_blank" rel="noopener noreferrer">
                  <Button>Go to PlayHQ</Button>
                </a>
              </CardContent>
            </Card>
          </ScrollRevealItem>

          <ScrollRevealItem>
            <Card>
              <CardContent className="p-6 space-y-3">
                <h2 className="text-2xl font-display font-bold">Social Membership</h2>
                <p className="text-content-muted">Apply online, then choose secure card payment or bank transfer.</p>
                <p className="font-semibold">From {plans.length ? formatCurrency(plans[0].price) : '...'}</p>
              </CardContent>
            </Card>
          </ScrollRevealItem>
        </ScrollReveal>

        <ScrollReveal>
          <h2 className="section-title mb-4">How joining works</h2>
          <Accordion
            items={[
              {
                id: 'player',
                question: 'How do I register as a player?',
                answer: (
                  <p>
                    Player registrations stay on PlayHQ as required.{' '}
                    <a href={PLAYHQ_ORG_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-maroon-700 underline underline-offset-2 dark:text-maroon-200">
                      Register on PlayHQ (opens in new tab)
                    </a>
                    .
                  </p>
                ),
              },
              {
                id: 'social',
                question: 'How does social membership work?',
                answer: (
                  <p>
                    Apply online using the form below. After submission, choose secure card payment or use the generated bank transfer reference.
                  </p>
                ),
              },
            ]}
          />
        </ScrollReveal>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-5">
              <input type="text" className="hidden" value={formData.hp_field} onChange={(e) => setFormData((p) => ({ ...p, hp_field: e.target.value }))} />
              <Input id="full_name" label="Full name" value={formData.full_name} onChange={(e) => setFormData((p) => ({ ...p, full_name: e.target.value }))} required />
              <Input id="email" label="Email" type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} required />
              <Input id="phone" label="Phone" value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} />

              <div>
                <label htmlFor="membership_plan" className="form-label">Membership Plan</label>
                <select id="membership_plan" className="form-input" value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}>
                  {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} - {formatCurrency(plan.price)}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <p className="form-label">Optional Add-ons</p>
                {addons.map((addon) => (
                  <label key={addon.id} className="flex items-center justify-between gap-3 border border-edge-strong rounded-lg px-4 py-3 font-body text-content-primary cursor-pointer transition-colors hover:border-maroon-300 has-[:checked]:border-maroon-500 has-[:checked]:bg-maroon-50/50 dark:border-slate-600 dark:text-slate-100">
                    <span>{addon.name} {addon.usage_limit ? `(limit ${addon.usage_limit})` : ''}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-semibold">{formatCurrency(addon.price)}</span>
                      <input type="checkbox" className="h-4 w-4 accent-maroon-700" checked={Boolean(selectedAddons[addon.id])} onChange={(e) => setSelectedAddons((p) => ({ ...p, [addon.id]: e.target.checked }))} />
                    </span>
                  </label>
                ))}
              </div>

              <Textarea id="notes" label="Notes" value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} />
              <p className="font-display text-lg font-bold text-maroon-800 dark:text-maroon-200 border-t border-edge-subtle pt-4">Estimated Total: {formatCurrency(total)}</p>
              <Button type="submit" isLoading={loading}>{loading ? 'Submitting...' : 'Submit Social Membership'}</Button>
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
      </div>
    </>
  );
}
