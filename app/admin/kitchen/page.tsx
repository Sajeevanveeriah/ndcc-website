'use client';

import { MEAL_COLLECTION_WINDOWS, mealCollectionLabel, mealServiceLabel, mealServiceDate } from '@/lib/meal-collection';
import { isThursdayServiceDate } from '@/lib/kitchen-export';

import { useEffect, useState } from 'react';
import KitchenOrderingControls from '@/components/admin/KitchenOrderingControls';
import Button from '@/components/ui/Button';
import DeleteRecordButton from '@/components/admin/DeleteRecordButton';
import ImageUploadField from '@/components/admin/ImageUploadField';
import Input from '@/components/ui/Input';
import { parseApiResponse } from '@/lib/admin-client';

type Menu = { id: string; name: string; is_active: boolean };
type Item = { id: string; menu_id: string; name: string; description: string; image_url: string | null; price: number; is_available: boolean; is_hidden: boolean; sort_order: number };
type KitchenOrder = { deleted_at?: string | null; meal_collection_window?: string | null; meal_service_date?: string | null; id: string; customer_name: string; total_amount: number; status: string; payment_status: string; payment_reference: string | null; processed: boolean; created_at: string };

export default function AdminKitchenPage() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [showDeleted,setShowDeleted]=useState(false);
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [exportDate, setExportDate] = useState(() => mealServiceDate());
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const visibleOrders = orders.filter((order) => Boolean(order.deleted_at)===showDeleted && (collectionFilter === 'all' || (collectionFilter === 'missing' ? !order.meal_collection_window : order.meal_collection_window === collectionFilter)));
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  async function exportWeek() {
    setExportMessage('');
    if (!isThursdayServiceDate(exportDate)) {
      setExportMessage('Choose a Thursday service date.');
      return;
    }
    setExporting(true);
    try {
      const response = await fetch(`/api/admin/kitchen/orders/export?service_date=${encodeURIComponent(exportDate)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not export orders. Please try again.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `NDCC-Kitchen-${exportDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage('Weekly CSV downloaded.');
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Could not export orders.');
    } finally {
      setExporting(false);
    }
  }
  const [menuForm, setMenuForm] = useState({ name: '', is_active: true });
  const [itemForm, setItemForm] = useState({ menu_id: '', name: '', description: '', image_url: '', price: '0', is_available: true, is_hidden: false, sort_order: '0' });

  // Edit states for menus
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [editMenuForm, setEditMenuForm] = useState({ name: '', is_active: true });

  // Edit states for items
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editItemForm, setEditItemForm] = useState({ menu_id: '', name: '', description: '', image_url: '', price: '0', is_available: true, is_hidden: false, sort_order: '0' });

  async function loadMenus() {
    try {
      const res = await fetch('/api/admin/resources/kitchenMenus', { cache: 'no-store' });
      const data = await parseApiResponse<{ data?: Menu[] }>(res);
      setMenus(data.data || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load menus.');
    }
  }

  async function loadItems() {
    try {
      const res = await fetch('/api/admin/resources/kitchenItems', { cache: 'no-store' });
      const data = await parseApiResponse<{ data?: Item[] }>(res);
      setItems(data.data || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load items.');
    }
  }

  async function loadOrders() {
    try {
      const res = await fetch('/api/admin/kitchen/orders?deleted=include', { cache: 'no-store' });
      const data = await parseApiResponse<{ data?: KitchenOrder[] }>(res);
      setOrders(data.data || []);
    } catch(error) {
      setMessage(error instanceof Error?error.message:'Could not load kitchen orders.');
    }
  }

  async function restoreOrder(id:string) {
    try {
      const response=await fetch('/api/admin/resources/kitchenOrders',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,restore:true})});
      await parseApiResponse(response);await loadOrders();setMessage('Kitchen order restored.');
    } catch(error) {setMessage(error instanceof Error?error.message:'Could not restore order.');}
  }

  async function updateOrder(id: string, patch: Partial<KitchenOrder>) {
    try {
      const res = await fetch('/api/admin/kitchen/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      await parseApiResponse(res);
      setMessage('Kitchen order updated.');
      loadOrders();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update kitchen order.');
    }
  }

  async function loadAll() {
    await Promise.all([loadMenus(), loadItems(), loadOrders()]);
  }

  // loadAll is intentionally stable for the mount-only fetch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, []);

  // --- Menu CRUD ---

  async function createMenu(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/admin/resources/kitchenMenus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(menuForm),
      });
      await parseApiResponse(res);
      setMessage('Menu created.');
      setMenuForm({ name: '', is_active: true });
      loadMenus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create menu.');
    } finally {
      setSaving(false);
    }
  }

  function openEditMenu(menu: Menu) {
    setEditingMenu(menu);
    setEditMenuForm({ name: menu.name, is_active: menu.is_active });
  }

  async function saveEditMenu(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMenu) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/resources/kitchenMenus', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingMenu.id, name: editMenuForm.name, is_active: editMenuForm.is_active }),
      });
      await parseApiResponse(res);
      setMessage('Menu updated.');
      setEditingMenu(null);
      loadMenus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update menu.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteMenu(id: string) {
    if (!confirm('Delete this menu and all its items? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/admin/resources/kitchenMenus?id=${id}`, { method: 'DELETE' });
      await parseApiResponse(res);
      setMessage('Menu deleted.');
      loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete menu.');
    }
  }

  // --- Item CRUD ---

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(itemForm.price || 0);
    const sortOrder = Number(itemForm.sort_order || 0);
    if (Number.isNaN(price) || Number.isNaN(sortOrder) || price < 0) {
      setMessage('Item price/sort order must be valid numbers.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/resources/kitchenItems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_id: itemForm.menu_id,
          name: itemForm.name,
          description: itemForm.description,
          image_url: itemForm.image_url.trim() || null,
          price,
          is_available: itemForm.is_available,
          is_hidden: itemForm.is_hidden,
          sort_order: sortOrder,
        }),
      });
      await parseApiResponse(res);
      setMessage('Item created.');
      setItemForm({ menu_id: '', name: '', description: '', image_url: '', price: '0', is_available: true, is_hidden: false, sort_order: '0' });
      loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create item.');
    } finally {
      setSaving(false);
    }
  }

  function openEditItem(item: Item) {
    setEditingItem(item);
    setEditItemForm({
      menu_id: item.menu_id,
      name: item.name,
      description: item.description,
      image_url: item.image_url || '',
      price: String(item.price),
      is_available: item.is_available,
      is_hidden: item.is_hidden,
      sort_order: String(item.sort_order),
    });
  }

  async function saveEditItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    const price = Number(editItemForm.price || 0);
    const sortOrder = Number(editItemForm.sort_order || 0);
    if (Number.isNaN(price) || Number.isNaN(sortOrder) || price < 0) {
      setMessage('Item price/sort order must be valid numbers.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/resources/kitchenItems', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingItem.id,
          menu_id: editItemForm.menu_id,
          name: editItemForm.name,
          description: editItemForm.description,
          image_url: editItemForm.image_url.trim() || null,
          price,
          is_available: editItemForm.is_available,
          is_hidden: editItemForm.is_hidden,
          sort_order: sortOrder,
        }),
      });
      await parseApiResponse(res);
      setMessage('Item updated.');
      setEditingItem(null);
      loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update item.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/admin/resources/kitchenItems?id=${id}`, { method: 'DELETE' });
      await parseApiResponse(res);
      setMessage('Item deleted.');
      loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete item.');
    }
  }

  async function toggleItem(item: Item, patch: Partial<Item>) {
    try {
      const res = await fetch('/api/admin/resources/kitchenItems', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, ...patch }),
      });
      await parseApiResponse(res);
      setMessage('Item updated.');
      loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update item.');
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-display font-bold">Kitchen Management</h1>
      {message && <p className="text-sm text-content-secondary bg-surface-page border rounded px-3 py-2">{message}</p>}

      <KitchenOrderingControls />

      {/* Menus */}
      <section className="bg-surface-card rounded-xl border p-5 space-y-4">
        <h2 className="text-lg font-semibold">Menus</h2>

        {editingMenu ? (
          <form onSubmit={saveEditMenu} className="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded-lg p-3 bg-blue-50">
            <Input id="edit_menu_name" label="Menu name" required value={editMenuForm.name} onChange={(e) => setEditMenuForm((v) => ({ ...v, name: e.target.value }))} />
            <label className="inline-flex items-center gap-2 text-sm mt-8">
              <input type="checkbox" checked={editMenuForm.is_active} onChange={(e) => setEditMenuForm((v) => ({ ...v, is_active: e.target.checked }))} />
              Active
            </label>
            <div className="md:col-span-2 flex gap-2">
              <Button type="submit" isLoading={saving}>Save Changes</Button>
              <Button type="button" variant="secondary" onClick={() => setEditingMenu(null)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <form onSubmit={createMenu} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input id="menu_name" label="Menu name" required value={menuForm.name} onChange={(e) => setMenuForm((v) => ({ ...v, name: e.target.value }))} />
            <label className="inline-flex items-center gap-2 text-sm mt-8">
              <input type="checkbox" checked={menuForm.is_active} onChange={(e) => setMenuForm((v) => ({ ...v, is_active: e.target.checked }))} />
              Active
            </label>
            <div className="md:col-span-2"><Button type="submit" isLoading={saving}>Create Menu</Button></div>
          </form>
        )}

        <div className="space-y-2">
          {menus.map((menu) => (
            <div key={menu.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
              <span className="font-medium">{menu.name} {menu.is_active && <span className="ml-1 text-green-600 text-xs">(Active)</span>}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => openEditMenu(menu)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => deleteMenu(menu.id)}>
                  <span className="text-red-500">Delete</span>
                </Button>
              </div>
            </div>
          ))}
          {menus.length === 0 && <p className="text-sm text-content-muted">No menus yet.</p>}
        </div>
      </section>

      {/* Menu Items */}
      <section className="bg-surface-card rounded-xl border p-5 space-y-4">
        <h2 className="text-lg font-semibold">Menu Items</h2>

        {editingItem ? (
          <form onSubmit={saveEditItem} className="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded-lg p-3 bg-blue-50">
            <label className="text-sm">Menu
              <select className="mt-1 w-full border rounded-lg px-3 py-2" value={editItemForm.menu_id} onChange={(e) => setEditItemForm((v) => ({ ...v, menu_id: e.target.value }))} required>
                <option value="">Select menu</option>
                {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <Input id="edit_item_name" label="Item name" required value={editItemForm.name} onChange={(e) => setEditItemForm((v) => ({ ...v, name: e.target.value }))} />
            <Input id="edit_item_description" label="Description" value={editItemForm.description} onChange={(e) => setEditItemForm((v) => ({ ...v, description: e.target.value }))} />
            <ImageUploadField id="edit_item_image_url" label="Image URL (optional)" value={editItemForm.image_url} onChange={(value) => setEditItemForm((v) => ({ ...v, image_url: value }))} />
            <Input id="edit_item_price" label="Price" type="number" required value={editItemForm.price} onChange={(e) => setEditItemForm((v) => ({ ...v, price: e.target.value }))} />
            <Input id="edit_item_sort" label="Sort order" type="number" value={editItemForm.sort_order} onChange={(e) => setEditItemForm((v) => ({ ...v, sort_order: e.target.value }))} />
            <div className="flex items-end gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editItemForm.is_available} onChange={(e) => setEditItemForm((v) => ({ ...v, is_available: e.target.checked }))} />
                Available
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editItemForm.is_hidden} onChange={(e) => setEditItemForm((v) => ({ ...v, is_hidden: e.target.checked }))} />
                Hidden
              </label>
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button type="submit" isLoading={saving}>Save Changes</Button>
              <Button type="button" variant="secondary" onClick={() => setEditingItem(null)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <form onSubmit={createItem} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">Menu
              <select className="mt-1 w-full border rounded-lg px-3 py-2" value={itemForm.menu_id} onChange={(e) => setItemForm((v) => ({ ...v, menu_id: e.target.value }))} required>
                <option value="">Select menu</option>
                {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <Input id="item_name" label="Item name" required value={itemForm.name} onChange={(e) => setItemForm((v) => ({ ...v, name: e.target.value }))} />
            <Input id="item_description" label="Description" value={itemForm.description} onChange={(e) => setItemForm((v) => ({ ...v, description: e.target.value }))} />
            <ImageUploadField id="item_image_url" label="Image URL (optional)" value={itemForm.image_url} onChange={(value) => setItemForm((v) => ({ ...v, image_url: value }))} />
            <Input id="item_price" label="Price" type="number" required value={itemForm.price} onChange={(e) => setItemForm((v) => ({ ...v, price: e.target.value }))} />
            <Input id="item_sort" label="Sort order" type="number" value={itemForm.sort_order} onChange={(e) => setItemForm((v) => ({ ...v, sort_order: e.target.value }))} />
            <div className="flex items-end gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={itemForm.is_available} onChange={(e) => setItemForm((v) => ({ ...v, is_available: e.target.checked }))} />
                Available
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={itemForm.is_hidden} onChange={(e) => setItemForm((v) => ({ ...v, is_hidden: e.target.checked }))} />
                Hidden
              </label>
            </div>
            <div className="md:col-span-2"><Button type="submit" isLoading={saving}>Add Item</Button></div>
          </form>
        )}

        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{item.name}</span>
                <span className="text-content-muted ml-2">${item.price}</span>
                {!item.is_available && <span className="ml-2 text-red-500 text-xs">Sold out</span>}
                {item.is_hidden && <span className="ml-2 text-gray-400 text-xs">Hidden</span>}
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                <Button size="sm" variant="ghost" onClick={() => openEditItem(item)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => toggleItem(item, { is_available: !item.is_available })}>
                  {item.is_available ? 'Sold Out' : 'Available'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleItem(item, { is_hidden: !item.is_hidden })}>
                  {item.is_hidden ? 'Unhide' : 'Hide'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteItem(item.id)}>
                  <span className="text-red-500">Delete</span>
                </Button>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-content-muted">No items yet.</p>}
        </div>
      </section>

      {/* Kitchen Orders */}
      <section className="bg-surface-card rounded-xl border p-5 space-y-3">
        <h2 className="text-lg font-semibold">Kitchen Orders</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Input id="kitchen-export-date" label="Thursday service date" type="date" value={exportDate} onChange={(event) => setExportDate(event.target.value)} />
          <Button type="button" onClick={exportWeek} isLoading={exporting}>Export weekly orders CSV</Button>
        </div>
        <p className="text-sm text-content-muted">Exports all orders for the selected Thursday, including payment status and both collection times. Historical orders without a recorded service date cannot be assigned to a week.</p>
        <p role="status" className="text-sm">{exportMessage}</p>
        <label className="block text-sm">Filter by collection time
          <select className="mt-1 block rounded border p-3 bg-surface-card" value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)}>
            <option value="all">All collection times</option>
            {MEAL_COLLECTION_WINDOWS.map((window) => <option key={window.value} value={window.value}>{window.label}</option>)}
            <option value="missing">Collection time not recorded</option>
          </select>
        </label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={showDeleted} onChange={e=>setShowDeleted(e.target.checked)}/>Show deleted orders</label>
        {visibleOrders.length === 0 ? (
          <p className="text-sm text-content-muted">No kitchen orders match this filter.</p>
        ) : (
          visibleOrders.map((o) => (
            <div key={o.id} className="border rounded-lg px-3 py-2 text-sm flex flex-col gap-3 lg:flex-row lg:items-center justify-between">
              <span><strong className="block">{mealCollectionLabel(o.meal_collection_window)}</strong><span className="block">{mealServiceLabel(o.meal_service_date)} (Australia/Melbourne)</span>{o.customer_name} · ${o.total_amount} · {o.status} · {o.payment_status} · {o.payment_reference || 'No reference'}</span>
              <div className="flex flex-wrap items-center gap-2">
                {o.deleted_at?<Button size="sm" onClick={()=>restoreOrder(o.id)}>Restore order</Button>:<>
                <label className="inline-flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={o.processed}
                    onChange={(e) => updateOrder(o.id, { processed: e.target.checked })}
                  />
                  Payment processed
                </label>
                <Button size="sm" variant="ghost" onClick={() => updateOrder(o.id, { payment_status: o.payment_status === 'paid' ? 'pending_bank_transfer' : 'paid' })}>
                  {o.payment_status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
                </Button>
                <span>{new Date(o.created_at).toLocaleString()}</span>
                <DeleteRecordButton
                  resource="kitchenOrders"
                  recordId={o.id}
                  recordLabel={`kitchen order for ${o.customer_name}`}
                  recordDetails={[
                    { label: 'Customer', value: o.customer_name },
                    { label: 'Total', value: `$${o.total_amount}` },
                    { label: 'Payment', value: o.payment_status },
                    { label: 'Processed', value: o.processed ? 'Yes' : 'No' },
                    { label: 'Date', value: new Date(o.created_at).toLocaleString() },
                  ]}
                  dangerLevel={o.payment_status === 'paid' || o.processed ? 'strong' : 'normal'}
                  requireTypedConfirmation={o.payment_status === 'paid' || o.processed}
                  strongWarning="This removes the order from active views. Payment history is retained and the order can be restored."
                  onDeleted={() => {void loadOrders();}}
                  onSuccessMessage={setMessage}
                /></>}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
