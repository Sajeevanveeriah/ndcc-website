'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type Plan = { id: string; name: string; price: number; is_active: boolean };
type Addon = { id: string; name: string; price: number; usage_limit: number | null; is_active: boolean };

export default function AdminMembershipsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [applications, setApplications] = useState<Array<{ id: string; full_name: string; email: string; status: string; created_at: string }>>([]);
  const [planName, setPlanName] = useState('');
  const [planPrice, setPlanPrice] = useState('0');

  const load = async () => {
    const [p, a, apps] = await Promise.all([
      fetch('/api/admin/resources/membershipPlans').then((r) => r.json()),
      fetch('/api/admin/resources/membershipAddons').then((r) => r.json()),
      fetch('/api/admin/resources/membershipApplications').then((r) => r.json()),
    ]);
    setPlans(p.data || []);
    setAddons(a.data || []);
    setApplications(apps.data || []);
  };

  useEffect(() => { load(); }, []);

  const addPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/admin/resources/membershipPlans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: planName, description: '', price: Number(planPrice), is_active: true, sort_order: plans.length + 1 }),
    });
    setPlanName(''); setPlanPrice('0');
    load();
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-display font-bold">Social Memberships</h1>

      <form onSubmit={addPlan} className="bg-white border rounded-xl p-4 grid md:grid-cols-3 gap-3 items-end">
        <Input id="plan-name" label="Plan name" value={planName} onChange={(e) => setPlanName(e.target.value)} required />
        <Input id="plan-price" label="Price" type="number" value={planPrice} onChange={(e) => setPlanPrice(e.target.value)} required />
        <Button type="submit">Add Plan</Button>
      </form>

      <div className="bg-white border rounded-xl p-4">
        <h2 className="font-display font-bold mb-3">Plans</h2>
        <ul className="space-y-2">{plans.map((p) => <li key={p.id}>{p.name} — ${p.price}</li>)}</ul>
      </div>

      <div className="bg-white border rounded-xl p-4">
        <h2 className="font-display font-bold mb-3">Add-ons</h2>
        <ul className="space-y-2">{addons.map((a) => <li key={a.id}>{a.name} — ${a.price}{a.usage_limit ? ` (limit ${a.usage_limit})` : ''}</li>)}</ul>
      </div>

      <div className="bg-white border rounded-xl p-4">
        <h2 className="font-display font-bold mb-3">Applications</h2>
        <ul className="space-y-2">{applications.map((app) => <li key={app.id}>{app.full_name} · {app.email} · {app.status}</li>)}</ul>
      </div>
    </div>
  );
}
