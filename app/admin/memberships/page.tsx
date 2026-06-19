'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import DeleteRecordButton from '@/components/admin/DeleteRecordButton';
import Input from '@/components/ui/Input';
import { parseApiResponse } from '@/lib/admin-client';

type Plan = { id: string; name: string; description: string | null; price: number; is_active: boolean; sort_order: number };
type Addon = { id: string; name: string; description: string | null; price: number; usage_limit: number | null; is_active: boolean; sort_order: number };
type Application = { id: string; full_name: string; email: string; status: string; created_at: string };

type EditablePlan = Omit<Plan, 'price' | 'sort_order'> & { price: string; sort_order: string };
type EditableAddon = Omit<Addon, 'price' | 'sort_order' | 'usage_limit'> & { price: string; sort_order: string; usage_limit: string };

const toPlanForm = (plan: Plan): EditablePlan => ({ ...plan, description: plan.description || '', price: String(plan.price), sort_order: String(plan.sort_order ?? 0) });
const toAddonForm = (addon: Addon): EditableAddon => ({ ...addon, description: addon.description || '', price: String(addon.price), sort_order: String(addon.sort_order ?? 0), usage_limit: addon.usage_limit === null ? '' : String(addon.usage_limit) });

function parseMoney(value: string, label: string) {
  const amount = Number(value);
  if (Number.isNaN(amount) || amount < 0) throw new Error(`${label} must be a valid non-negative number.`);
  return amount;
}

function parseOrder(value: string) {
  const order = Number(value);
  if (Number.isNaN(order)) throw new Error('Sort order must be a valid number.');
  return order;
}

export default function AdminMembershipsPage() {
  const [plans, setPlans] = useState<EditablePlan[]>([]);
  const [addons, setAddons] = useState<EditableAddon[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [newPlan, setNewPlan] = useState({ name: '', description: '', price: '0' });
  const [newAddon, setNewAddon] = useState({ name: '', description: '', price: '0', usage_limit: '', sort_order: '0' });
  const [message, setMessage] = useState('');
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const loadPricing = async () => {
    try {
      const [pRes, aRes] = await Promise.all([
        fetch('/api/admin/resources/membershipPlans', { cache: 'no-store' }),
        fetch('/api/admin/resources/membershipAddons', { cache: 'no-store' }),
      ]);
      const [p, a] = await Promise.all([
        parseApiResponse<{ data?: Plan[] }>(pRes),
        parseApiResponse<{ data?: Addon[] }>(aRes),
      ]);
      setPlans((p.data || []).map(toPlanForm));
      setAddons((a.data || []).map(toAddonForm));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load membership pricing.');
    }
  };

  const loadApplications = async () => {
    setLoadingApplications(true);
    try {
      const appsRes = await fetch('/api/admin/resources/membershipApplications?limit=25', { cache: 'no-store' });
      const apps = await parseApiResponse<{ data?: Application[] }>(appsRes);
      setApplications(apps.data || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load membership applications.');
    } finally {
      setLoadingApplications(false);
    }
  };

  useEffect(() => {
    loadPricing();
    loadApplications();
  }, []);

  const addPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKey('new-plan');
    try {
      const price = parseMoney(newPlan.price, 'Plan price');
      const res = await fetch('/api/admin/resources/membershipPlans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlan.name, description: newPlan.description, price, is_active: true, sort_order: plans.length + 1 }),
      });
      await parseApiResponse(res);
      setNewPlan({ name: '', description: '', price: '0' });
      setMessage('Membership plan added.');
      loadPricing();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add membership plan.');
    } finally {
      setSavingKey(null);
    }
  };

  const addAddon = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKey('new-addon');
    try {
      const price = parseMoney(newAddon.price, 'Add-on price');
      const usageLimit = newAddon.usage_limit.trim() ? Number(newAddon.usage_limit) : null;
      if (usageLimit !== null && (Number.isNaN(usageLimit) || usageLimit < 0)) throw new Error('Usage limit must be a valid non-negative number.');
      const res = await fetch('/api/admin/resources/membershipAddons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newAddon, price, usage_limit: usageLimit, is_active: true, sort_order: addons.length + 1 }),
      });
      await parseApiResponse(res);
      setNewAddon({ name: '', description: '', price: '0', usage_limit: '', sort_order: '0' });
      setMessage('Membership add-on added.');
      loadPricing();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add membership add-on.');
    } finally {
      setSavingKey(null);
    }
  };

  const savePlan = async (plan: EditablePlan) => {
    setSavingKey(`plan-${plan.id}`);
    try {
      const res = await fetch('/api/admin/resources/membershipPlans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plan.id, name: plan.name, description: plan.description || '', price: parseMoney(plan.price, 'Plan price'), is_active: plan.is_active, sort_order: parseOrder(plan.sort_order) }),
      });
      await parseApiResponse(res);
      setMessage('Membership plan updated.');
      loadPricing();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update membership plan.');
    } finally {
      setSavingKey(null);
    }
  };

  const saveAddon = async (addon: EditableAddon) => {
    setSavingKey(`addon-${addon.id}`);
    try {
      const usageLimit = addon.usage_limit.trim() ? Number(addon.usage_limit) : null;
      if (usageLimit !== null && (Number.isNaN(usageLimit) || usageLimit < 0)) throw new Error('Usage limit must be a valid non-negative number.');
      const res = await fetch('/api/admin/resources/membershipAddons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: addon.id, name: addon.name, description: addon.description || '', price: parseMoney(addon.price, 'Add-on price'), usage_limit: usageLimit, is_active: addon.is_active, sort_order: parseOrder(addon.sort_order) }),
      });
      await parseApiResponse(res);
      setMessage('Membership add-on updated.');
      loadPricing();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update membership add-on.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold">Social Memberships</h1>
        <p className="text-sm text-gray-600 mt-1">Edit public membership plans and add-ons without changing signup, payment, or email behaviour.</p>
      </div>
      {message && <p className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-gray-700">{message}</p>}

      <form onSubmit={addPlan} className="bg-white border rounded-xl p-4 grid md:grid-cols-4 gap-3 items-end">
        <Input id="plan-name" label="New plan name" value={newPlan.name} onChange={(e) => setNewPlan((prev) => ({ ...prev, name: e.target.value }))} required />
        <Input id="plan-description" label="Description" value={newPlan.description} onChange={(e) => setNewPlan((prev) => ({ ...prev, description: e.target.value }))} />
        <Input id="plan-price" label="Price" type="number" min="0" step="0.01" value={newPlan.price} onChange={(e) => setNewPlan((prev) => ({ ...prev, price: e.target.value }))} required />
        <Button type="submit" isLoading={savingKey === 'new-plan'}>Add Plan</Button>
      </form>

      <div className="bg-white border rounded-xl p-4 overflow-x-auto">
        <h2 className="font-display font-bold mb-3">Plans</h2>
        <div className="space-y-3 min-w-[760px]">
          {plans.map((plan, index) => (
            <div key={plan.id} className="grid grid-cols-[1.3fr_1.5fr_0.55fr_0.45fr_0.5fr_auto] gap-3 items-end rounded-lg border border-gray-100 p-3">
              <Input id={`plan-name-${plan.id}`} label="Name" value={plan.name} onChange={(e) => setPlans((prev) => prev.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
              <Input id={`plan-description-${plan.id}`} label="Description" value={plan.description || ''} onChange={(e) => setPlans((prev) => prev.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
              <Input id={`plan-price-${plan.id}`} label="Price" type="number" min="0" step="0.01" value={plan.price} onChange={(e) => setPlans((prev) => prev.map((item, i) => i === index ? { ...item, price: e.target.value } : item))} />
              <Input id={`plan-order-${plan.id}`} label="Order" type="number" value={plan.sort_order} onChange={(e) => setPlans((prev) => prev.map((item, i) => i === index ? { ...item, sort_order: e.target.value } : item))} />
              <label className="flex items-center gap-2 pb-2 text-sm text-gray-700"><input type="checkbox" checked={plan.is_active} onChange={(e) => setPlans((prev) => prev.map((item, i) => i === index ? { ...item, is_active: e.target.checked } : item))} /> Active</label>
              <Button size="sm" onClick={() => savePlan(plan)} isLoading={savingKey === `plan-${plan.id}`}>Save</Button>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={addAddon} className="bg-white border rounded-xl p-4 grid md:grid-cols-5 gap-3 items-end">
        <Input id="addon-name" label="New add-on name" value={newAddon.name} onChange={(e) => setNewAddon((prev) => ({ ...prev, name: e.target.value }))} required />
        <Input id="addon-description" label="Description" value={newAddon.description} onChange={(e) => setNewAddon((prev) => ({ ...prev, description: e.target.value }))} />
        <Input id="addon-price" label="Price" type="number" min="0" step="0.01" value={newAddon.price} onChange={(e) => setNewAddon((prev) => ({ ...prev, price: e.target.value }))} required />
        <Input id="addon-limit" label="Usage limit" type="number" min="0" value={newAddon.usage_limit} onChange={(e) => setNewAddon((prev) => ({ ...prev, usage_limit: e.target.value }))} />
        <Button type="submit" isLoading={savingKey === 'new-addon'}>Add Add-on</Button>
      </form>

      <div className="bg-white border rounded-xl p-4 overflow-x-auto">
        <h2 className="font-display font-bold mb-3">Add-ons</h2>
        <div className="space-y-3 min-w-[860px]">
          {addons.map((addon, index) => (
            <div key={addon.id} className="grid grid-cols-[1.2fr_1.5fr_0.45fr_0.45fr_0.4fr_0.5fr_auto] gap-3 items-end rounded-lg border border-gray-100 p-3">
              <Input id={`addon-name-${addon.id}`} label="Name" value={addon.name} onChange={(e) => setAddons((prev) => prev.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
              <Input id={`addon-description-${addon.id}`} label="Description" value={addon.description || ''} onChange={(e) => setAddons((prev) => prev.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
              <Input id={`addon-price-${addon.id}`} label="Price" type="number" min="0" step="0.01" value={addon.price} onChange={(e) => setAddons((prev) => prev.map((item, i) => i === index ? { ...item, price: e.target.value } : item))} />
              <Input id={`addon-limit-${addon.id}`} label="Limit" type="number" min="0" value={addon.usage_limit} onChange={(e) => setAddons((prev) => prev.map((item, i) => i === index ? { ...item, usage_limit: e.target.value } : item))} />
              <Input id={`addon-order-${addon.id}`} label="Order" type="number" value={addon.sort_order} onChange={(e) => setAddons((prev) => prev.map((item, i) => i === index ? { ...item, sort_order: e.target.value } : item))} />
              <label className="flex items-center gap-2 pb-2 text-sm text-gray-700"><input type="checkbox" checked={addon.is_active} onChange={(e) => setAddons((prev) => prev.map((item, i) => i === index ? { ...item, is_active: e.target.checked } : item))} /> Active</label>
              <Button size="sm" onClick={() => saveAddon(addon)} isLoading={savingKey === `addon-${addon.id}`}>Save</Button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-display font-bold">Recent Applications</h2>
          <Button size="sm" variant="secondary" onClick={loadApplications} isLoading={loadingApplications}>Refresh</Button>
        </div>
        <ul className="space-y-2 text-sm text-gray-700">
          {applications.map((app) => (
            <li key={app.id} className="flex items-center justify-between gap-3">
              <span>{app.full_name} · {app.email} · {app.status}</span>
              <DeleteRecordButton
                resource="membershipApplications"
                recordId={app.id}
                recordLabel={`membership application from ${app.full_name}`}
                recordDetails={[
                  { label: 'Name', value: app.full_name },
                  { label: 'Email', value: app.email },
                  { label: 'Date', value: new Date(app.created_at).toLocaleString() },
                ]}
                onDeleted={(id) => setApplications((prev) => prev.filter((item) => item.id !== id))}
                onSuccessMessage={setMessage}
              />
            </li>
          ))}
          {!loadingApplications && applications.length === 0 && <li>No recent applications found.</li>}
        </ul>
      </div>
    </div>
  );
}
