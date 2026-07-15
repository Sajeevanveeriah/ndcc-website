'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import Card, { CardContent } from '@/components/ui/Card';
import Input, { Textarea } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import { fallbackMembershipAddons, fallbackMembershipPlans } from '@/lib/fallback-content';
import { PLAYHQ_ORG_URL } from '@/lib/constants';

interface Plan { id: string; name: string; description: string; price: number; }
interface Addon { id: string; name: string; description: string; price: number; usage_limit: number | null; }

export default function JoinPage() {
  const [plans, setPlans] = useState<Plan[]>(fallbackMembershipPlans);
  const [addons, setAddons] = useState<Addon[]>(fallbackMembershipAddons);
  const [selectedPlan, setSelectedPlan] = useState(fallbackMembershipPlans[0]?.id || '');
  const [selectedAddons, setSelectedAddons] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({ full_name: '', email: '', phone: '', notes: '', hp_field: '', submitted_at: Date.now() });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
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
        // fallback copy remains in state
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
    setMessage('');

    const payload = {
      ...formData,
      membership_plan_id: selectedPlan,
      addons: Object.keys(selectedAddons).filter((id) => selectedAddons[id]).map((addon_id) => ({ addon_id, quantity: 1 })),
    };

    const res = await fetch('/api/memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (res.ok) {
      setMessage(`Application submitted. Order #${data.order_id} created with pending bank transfer.`);
      setFormData({ full_name: '', email: '', phone: '', notes: '', hp_field: '', submitted_at: Date.now() });
      setSelectedAddons({});
    } else {
      setMessage(data.error || 'Unable to submit membership application.');
    }

    setLoading(false);
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
              <p className="text-content-muted">Apply online and pay by bank transfer reference generated at checkout.</p>
              <p className="font-semibold">From {plans.length ? formatCurrency(plans[0].price) : '...'}</p>
            </CardContent>
          </Card>
        </ScrollRevealItem>
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
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {formatCurrency(plan.price)}</option>)}
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
            <Button type="submit" isLoading={loading}>Submit Social Membership</Button>
            {message && <p className="text-sm text-content-muted">{message}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
