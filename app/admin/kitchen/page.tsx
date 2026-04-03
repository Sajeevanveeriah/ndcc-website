'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type Menu = { id: string; name: string; is_active: boolean };
type Item = { id: string; menu_id: string; name: string; description: string; price: number; is_available: boolean; is_hidden: boolean; sort_order: number };
type KitchenOrder = { id: string; customer_name: string; total_amount: number; status: string; payment_status: string; created_at: string };

export default function AdminKitchenPage() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [message, setMessage] = useState('');
  const [menuForm, setMenuForm] = useState({ name: '', is_active: true });
  const [itemForm, setItemForm] = useState({ menu_id: '', name: '', description: '', price: '0', is_available: true, is_hidden: false, sort_order: '0' });

  async function loadAll() {
    const [mRes, iRes, oRes] = await Promise.all([
      fetch('/api/admin/resources/kitchenMenus', { cache: 'no-store' }),
      fetch('/api/admin/resources/kitchenItems', { cache: 'no-store' }),
      fetch('/api/admin/kitchen/orders', { cache: 'no-store' }),
    ]);
    const mData = await mRes.json();
    const iData = await iRes.json();
    const oData = await oRes.json();
    if (mRes.ok) setMenus(mData.data || []);
    if (iRes.ok) setItems(iData.data || []);
    if (oRes.ok) setOrders(oData.data || []);
  }

  useEffect(() => { loadAll(); }, []);

  async function createMenu(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/resources/kitchenMenus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(menuForm),
    });
    setMessage(res.ok ? 'Menu saved.' : 'Failed to save menu.');
    if (res.ok) {
      setMenuForm({ name: '', is_active: true });
      loadAll();
    }
  }

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/resources/kitchenItems', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_id: itemForm.menu_id,
        name: itemForm.name,
        description: itemForm.description,
        price: Number(itemForm.price || 0),
        is_available: itemForm.is_available,
        is_hidden: itemForm.is_hidden,
        sort_order: Number(itemForm.sort_order || 0),
      }),
    });
    setMessage(res.ok ? 'Item saved.' : 'Failed to save item.');
    if (res.ok) {
      setItemForm({ menu_id: '', name: '', description: '', price: '0', is_available: true, is_hidden: false, sort_order: '0' });
      loadAll();
    }
  }

  async function toggleItem(item: Item, patch: Partial<Item>) {
    await fetch('/api/admin/resources/kitchenItems', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, ...patch }),
    });
    loadAll();
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-display font-bold">Kitchen Management</h1>
      {message && <p className="text-sm text-gray-600">{message}</p>}

      <section className="bg-white rounded-xl border p-5 space-y-4">
        <h2 className="text-lg font-semibold">Menus</h2>
        <form onSubmit={createMenu} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input id="menu_name" label="Menu name" required value={menuForm.name} onChange={(e) => setMenuForm((v) => ({ ...v, name: e.target.value }))} />
          <label className="inline-flex items-center gap-2 text-sm mt-8"><input type="checkbox" checked={menuForm.is_active} onChange={(e) => setMenuForm((v) => ({ ...v, is_active: e.target.checked }))} />Active</label>
          <div className="md:col-span-2"><Button type="submit">Save Menu</Button></div>
        </form>
      </section>

      <section className="bg-white rounded-xl border p-5 space-y-4">
        <h2 className="text-lg font-semibold">Menu Items</h2>
        <form onSubmit={createItem} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">Menu
            <select className="mt-1 w-full border rounded-lg px-3 py-2" value={itemForm.menu_id} onChange={(e) => setItemForm((v) => ({ ...v, menu_id: e.target.value }))} required>
              <option value="">Select menu</option>
              {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <Input id="item_name" label="Item name" required value={itemForm.name} onChange={(e) => setItemForm((v) => ({ ...v, name: e.target.value }))} />
          <Input id="item_description" label="Description" value={itemForm.description} onChange={(e) => setItemForm((v) => ({ ...v, description: e.target.value }))} />
          <Input id="item_price" label="Price" type="number" required value={itemForm.price} onChange={(e) => setItemForm((v) => ({ ...v, price: e.target.value }))} />
          <Input id="item_sort" label="Sort order" type="number" value={itemForm.sort_order} onChange={(e) => setItemForm((v) => ({ ...v, sort_order: e.target.value }))} />
          <div className="flex items-end gap-4">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={itemForm.is_available} onChange={(e) => setItemForm((v) => ({ ...v, is_available: e.target.checked }))} />Available</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={itemForm.is_hidden} onChange={(e) => setItemForm((v) => ({ ...v, is_hidden: e.target.checked }))} />Hidden</label>
          </div>
          <div className="md:col-span-2"><Button type="submit">Save Item</Button></div>
        </form>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
              <span>{item.name} (${item.price})</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => toggleItem(item, { is_available: !item.is_available })}>
                  {item.is_available ? 'Mark Sold Out' : 'Mark Available'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleItem(item, { is_hidden: !item.is_hidden })}>
                  {item.is_hidden ? 'Unhide' : 'Hide'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border p-5 space-y-3">
        <h2 className="text-lg font-semibold">Kitchen Orders</h2>
        {orders.length === 0 ? <p className="text-sm text-gray-500">No kitchen orders yet.</p> : orders.map((o) => (
          <div key={o.id} className="border rounded-lg px-3 py-2 text-sm flex items-center justify-between">
            <span>{o.customer_name} · ${o.total_amount} · {o.status} · {o.payment_status}</span>
            <span>{new Date(o.created_at).toLocaleString()}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
