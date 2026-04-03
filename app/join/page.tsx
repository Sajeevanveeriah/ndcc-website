'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Card, { CardContent } from '@/components/ui/Card';
import Input, { Textarea } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';

interface Plan { id: string; name: string; description: string; price: number; }
interface Addon { id: string; name: string; description: string; price: number; usage_limit: number | null; }

export default function JoinPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [selectedAddons, setSelectedAddons] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({ full_name: '', email: '', phone: '', notes: '', hp_field: '', submitted_at: Date.now() });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [heroTitle, setHeroTitle] = useState('Join the Club');
  const [heroBody, setHeroBody] = useState('Choose player registration via PlayHQ or apply for social membership below.');

  useEffect(() => {
    const load = async () => {
      const [membershipRes, contentRes] = await Promise.all([
        fetch('/api/memberships', { cache: 'no-store' }),
        fetch('/api/content-blocks?keys=join.hero', { cache: 'no-store' }),
      ]);

      const data = await membershipRes.json();
      if (membershipRes.ok) {
        setPlans(data.plans || []);
        setAddons(data.addons || []);
        if ((data.plans || []).length > 0) setSelectedPlan(data.plans[0].id);
      }

      const contentData = await contentRes.json();
      const block = (contentData.data || []).find((b: { block_key: string }) => b.block_key === 'join.hero');
      if (block?.title) setHeroTitle(block.title);
      if (block?.body) setHeroBody(block.body);
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
    <div className="container-width py-12 space-y-10">
      <div>
        <h1 className="text-4xl font-display font-bold text-gray-900">{heroTitle}</h1>
        <p className="text-gray-600 mt-3">{heroBody}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="text-2xl font-display font-bold">Player Registration</h2>
            <p className="text-gray-600">Player registrations stay on PlayHQ as required.</p>
            <a href={process.env.NEXT_PUBLIC_PLAYHQ_URL || '#'} target="_blank" rel="noopener noreferrer">
              <Button>Go to PlayHQ</Button>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="text-2xl font-display font-bold">Social Membership</h2>
            <p className="text-gray-600">Apply online and pay by bank transfer reference generated at checkout.</p>
            <p className="font-semibold">From {plans.length ? formatCurrency(plans[0].price) : '...'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={submit} className="space-y-5">
            <input type="text" className="hidden" value={formData.hp_field} onChange={(e) => setFormData((p) => ({ ...p, hp_field: e.target.value }))} />
            <Input id="full_name" label="Full name" value={formData.full_name} onChange={(e) => setFormData((p) => ({ ...p, full_name: e.target.value }))} required />
            <Input id="email" label="Email" type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} required />
            <Input id="phone" label="Phone" value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} />

            <label className="block text-sm font-medium text-gray-700">Membership Plan</label>
            <select className="w-full border rounded-lg px-3 py-2" value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {formatCurrency(plan.price)}</option>)}
            </select>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Optional Add-ons</p>
              {addons.map((addon) => (
                <label key={addon.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                  <span>{addon.name} {addon.usage_limit ? `(limit ${addon.usage_limit})` : ''}</span>
                  <span className="flex items-center gap-3">
                    <span>{formatCurrency(addon.price)}</span>
                    <input type="checkbox" checked={Boolean(selectedAddons[addon.id])} onChange={(e) => setSelectedAddons((p) => ({ ...p, [addon.id]: e.target.checked }))} />
                  </span>
                </label>
              ))}
            </div>

            <Textarea id="notes" label="Notes" value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} />
            <p className="font-semibold">Estimated Total: {formatCurrency(total)}</p>
            <Button type="submit" isLoading={loading}>Submit Social Membership</Button>
            {message && <p className="text-sm text-gray-600">{message}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
