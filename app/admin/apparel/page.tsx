'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import ImageUploadField from '@/components/admin/ImageUploadField';
import Input from '@/components/ui/Input';
import { parseApiResponse } from '@/lib/admin-client';

type ApparelProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  sizes: string[];
  image_url: string;
  customisable: boolean;
  category: string;
  display_order: number;
  order_guidance: string | null;
  size_guidance: string | null;
  active: boolean;
  // Payment-readiness fields (absent until the payment migration is applied).
  payment_mode?: string | null;
  payment_link_url?: string | null;
  stripe_price_id?: string | null;
  checkout_enabled?: boolean | null;
  fulfilment_notes?: string | null;
  order_email?: string | null;
};

const PAYMENT_MODES = [
  { value: 'manual_enquiry', label: 'Manual enquiry (bank transfer)' },
  { value: 'stripe_payment_link', label: 'Stripe payment link' },
  { value: 'stripe_checkout', label: 'Stripe checkout' },
] as const;

const EMPTY_PRODUCT_FORM = {
  slug: '',
  name: '',
  description: '',
  price: '0',
  sizes: 'XS,S,M,L,XL',
  image_url: '',
  customisable: false,
  category: 'General',
  display_order: '1',
  order_guidance: '',
  size_guidance: '',
  active: true,
  payment_mode: 'manual_enquiry',
  payment_link_url: '',
  stripe_price_id: '',
  checkout_enabled: false,
  fulfilment_notes: '',
  order_email: '',
};

type MerchWindow = {
  id: string;
  label: string;
  open_date: string;
  close_date: string;
  active: boolean;
  allow_queue_after_close: boolean;
};

export default function AdminApparelPage() {
  const [products, setProducts] = useState<ApparelProduct[]>([]);
  const [windows, setWindows] = useState<MerchWindow[]>([]);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingWindowId, setEditingWindowId] = useState<string | null>(null);

  const [productForm, setProductForm] = useState({ ...EMPTY_PRODUCT_FORM });

  const [windowForm, setWindowForm] = useState({
    label: '',
    open_date: '',
    close_date: '',
    active: true,
    allow_queue_after_close: true,
  });

  async function loadAll() {
    try {
      const [pRes, wRes] = await Promise.all([
        fetch('/api/admin/resources/apparelProducts', { cache: 'no-store' }),
        fetch('/api/admin/resources/merchWindows', { cache: 'no-store' }),
      ]);
      const [pData, wData] = await Promise.all([
        parseApiResponse<{ data?: ApparelProduct[] }>(pRes),
        parseApiResponse<{ data?: MerchWindow[] }>(wRes),
      ]);
      setProducts(pData.data || []);
      setWindows(wData.data || []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load apparel data.');
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(productForm.price || 0);
    if (Number.isNaN(price) || price < 0) {
      setStatus('Product price must be a valid non-negative number.');
      return;
    }
    const payload = {
      slug: productForm.slug.trim(),
      name: productForm.name.trim(),
      description: productForm.description.trim(),
      price,
      sizes: productForm.sizes.split(',').map((s) => s.trim()).filter(Boolean),
      image_url: productForm.image_url.trim(),
      customisable: productForm.customisable,
      category: productForm.category.trim() || 'General',
      display_order: Number(productForm.display_order || 0),
      order_guidance: productForm.order_guidance.trim() || null,
      size_guidance: productForm.size_guidance.trim() || null,
      active: productForm.active,
      payment_mode: productForm.payment_mode || 'manual_enquiry',
      payment_link_url: productForm.payment_link_url.trim() || null,
      stripe_price_id: productForm.stripe_price_id.trim() || null,
      checkout_enabled: productForm.checkout_enabled,
      fulfilment_notes: productForm.fulfilment_notes.trim() || null,
      order_email: productForm.order_email.trim() || null,
    };

    setSaving(true);
    const res = await fetch('/api/admin/resources/apparelProducts', {
      method: editingProductId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingProductId ? { id: editingProductId, ...payload } : payload),
    });
    try {
      await parseApiResponse(res);
      setStatus(editingProductId ? 'Product updated.' : 'Product saved.');
      setProductForm({ ...EMPTY_PRODUCT_FORM });
      setEditingProductId(null);
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  }

  function editProduct(product: ApparelProduct) {
    setEditingProductId(product.id);
    setProductForm({
      slug: product.slug,
      name: product.name,
      description: product.description || '',
      price: String(product.price ?? 0),
      sizes: Array.isArray(product.sizes) ? product.sizes.join(',') : '',
      image_url: product.image_url || '',
      customisable: product.customisable,
      category: product.category || 'General',
      display_order: String(product.display_order ?? 0),
      order_guidance: product.order_guidance || '',
      size_guidance: product.size_guidance || '',
      active: product.active,
      payment_mode: product.payment_mode || 'manual_enquiry',
      payment_link_url: product.payment_link_url || '',
      stripe_price_id: product.stripe_price_id || '',
      checkout_enabled: Boolean(product.checkout_enabled),
      fulfilment_notes: product.fulfilment_notes || '',
      order_email: product.order_email || '',
    });
  }

  async function toggleProductActive(product: ApparelProduct) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/resources/apparelProducts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, active: !product.active }),
      });
      await parseApiResponse(res);
      setStatus(product.active ? `Archived "${product.name}".` : `Restored "${product.name}".`);
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update product.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: ApparelProduct) {
    if (!window.confirm(`Delete "${product.name}" permanently? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/resources/apparelProducts?id=${encodeURIComponent(product.id)}`, {
        method: 'DELETE',
      });
      await parseApiResponse(res);
      setStatus(`Deleted "${product.name}".`);
      if (editingProductId === product.id) {
        setEditingProductId(null);
        setProductForm({ ...EMPTY_PRODUCT_FORM });
      }
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete product.');
    } finally {
      setSaving(false);
    }
  }

  async function createWindow(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/admin/resources/merchWindows', {
      method: editingWindowId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingWindowId ? { id: editingWindowId, ...windowForm } : windowForm),
    });
    try {
      await parseApiResponse(res);
      setStatus(editingWindowId ? 'Window updated.' : 'Window saved.');
      setWindowForm({ label: '', open_date: '', close_date: '', active: true, allow_queue_after_close: true });
      setEditingWindowId(null);
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save window.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-display font-bold">Apparel & Merch Windows</h1>
      {status && <p className="text-sm text-content-muted">{status}</p>}

      <section className="bg-surface-card border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">{editingProductId ? 'Edit Apparel Product' : 'Add Apparel Product'}</h2>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={createProduct}>
          <Input id="slug" label="Slug" required value={productForm.slug} onChange={(e) => setProductForm((v) => ({ ...v, slug: e.target.value }))} />
          <Input id="name" label="Name" required value={productForm.name} onChange={(e) => setProductForm((v) => ({ ...v, name: e.target.value }))} />
          <Input id="price" label="Price" type="number" required value={productForm.price} onChange={(e) => setProductForm((v) => ({ ...v, price: e.target.value }))} />
          <Input id="sizes" label="Sizes CSV" value={productForm.sizes} onChange={(e) => setProductForm((v) => ({ ...v, sizes: e.target.value }))} />
          <Input id="description" label="Description" value={productForm.description} onChange={(e) => setProductForm((v) => ({ ...v, description: e.target.value }))} />
          <ImageUploadField id="image_url" label="Image URL (optional)" value={productForm.image_url} onChange={(value) => setProductForm((v) => ({ ...v, image_url: value }))} />
          <Input id="category" label="Category" value={productForm.category} onChange={(e) => setProductForm((v) => ({ ...v, category: e.target.value }))} />
          <Input id="display_order" label="Display order" type="number" value={productForm.display_order} onChange={(e) => setProductForm((v) => ({ ...v, display_order: e.target.value }))} />
          <Input id="order_guidance" label="Order guidance" value={productForm.order_guidance} onChange={(e) => setProductForm((v) => ({ ...v, order_guidance: e.target.value }))} />
          <Input id="size_guidance" label="Size guidance" value={productForm.size_guidance} onChange={(e) => setProductForm((v) => ({ ...v, size_guidance: e.target.value }))} />
          <div>
            <label htmlFor="payment_mode" className="form-label">Payment mode</label>
            <select
              id="payment_mode"
              className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm font-body focus:border-maroon-500 focus:ring-1 focus:ring-maroon-500 outline-none bg-surface-card"
              value={productForm.payment_mode}
              onChange={(e) => setProductForm((v) => ({ ...v, payment_mode: e.target.value }))}
            >
              {PAYMENT_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>{mode.label}</option>
              ))}
            </select>
          </div>
          <Input id="payment_link_url" label="Payment link URL (stripe_payment_link mode)" value={productForm.payment_link_url} onChange={(e) => setProductForm((v) => ({ ...v, payment_link_url: e.target.value }))} />
          <Input id="stripe_price_id" label="Stripe price ID (stripe_checkout mode)" value={productForm.stripe_price_id} onChange={(e) => setProductForm((v) => ({ ...v, stripe_price_id: e.target.value }))} />
          <Input id="fulfilment_notes" label="Fulfilment notes" value={productForm.fulfilment_notes} onChange={(e) => setProductForm((v) => ({ ...v, fulfilment_notes: e.target.value }))} />
          <Input id="order_email" label="Order notification email" type="email" value={productForm.order_email} onChange={(e) => setProductForm((v) => ({ ...v, order_email: e.target.value }))} />
          <div className="flex items-end gap-4">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={productForm.customisable} onChange={(e) => setProductForm((v) => ({ ...v, customisable: e.target.checked }))} />Customisable</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={productForm.active} onChange={(e) => setProductForm((v) => ({ ...v, active: e.target.checked }))} />Active</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={productForm.checkout_enabled} onChange={(e) => setProductForm((v) => ({ ...v, checkout_enabled: e.target.checked }))} />Checkout enabled</label>
          </div>
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" isLoading={saving}>{editingProductId ? 'Update Product' : 'Save Product'}</Button>
            {editingProductId && (
              <Button type="button" variant="secondary" onClick={() => {
                setEditingProductId(null);
                setProductForm({ ...EMPTY_PRODUCT_FORM });
              }}
              >
                Cancel Edit
              </Button>
            )}
          </div>
        </form>
        <ul className="text-sm text-content-secondary space-y-1">
          {products.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${p.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-content-muted'}`}
                >
                  {p.active ? 'Active' : 'Archived'}
                </span>
                <span>{p.name} · ${p.price} · {p.category} · order {p.display_order} · {p.sizes.join('/')}</span>
              </span>
              <span className="flex items-center gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => editProduct(p)}>Edit</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => toggleProductActive(p)}>
                  {p.active ? 'Archive' : 'Restore'}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => deleteProduct(p)}>
                  Delete
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-surface-card border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">{editingWindowId ? 'Edit Merch Window' : 'Add Merch Window'}</h2>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={createWindow}>
          <Input id="label" label="Label" required value={windowForm.label} onChange={(e) => setWindowForm((v) => ({ ...v, label: e.target.value }))} />
          <Input id="open_date" label="Open date" type="datetime-local" required value={windowForm.open_date} onChange={(e) => setWindowForm((v) => ({ ...v, open_date: e.target.value }))} />
          <Input id="close_date" label="Close date" type="datetime-local" required value={windowForm.close_date} onChange={(e) => setWindowForm((v) => ({ ...v, close_date: e.target.value }))} />
          <div className="flex items-end gap-4">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={windowForm.active} onChange={(e) => setWindowForm((v) => ({ ...v, active: e.target.checked }))} />Active</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={windowForm.allow_queue_after_close} onChange={(e) => setWindowForm((v) => ({ ...v, allow_queue_after_close: e.target.checked }))} />Allow queue after close</label>
          </div>
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" isLoading={saving}>{editingWindowId ? 'Update Window' : 'Save Window'}</Button>
            {editingWindowId && (
              <Button type="button" variant="secondary" onClick={() => {
                setEditingWindowId(null);
                setWindowForm({ label: '', open_date: '', close_date: '', active: true, allow_queue_after_close: true });
              }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>

        <ul className="text-sm text-content-secondary space-y-1">
          {windows.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2">
              <span>{w.label} · {new Date(w.open_date).toLocaleDateString()} - {new Date(w.close_date).toLocaleDateString()} · {w.active ? 'Active' : 'Inactive'} · {w.allow_queue_after_close ? 'Queue enabled' : 'Queue disabled'}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingWindowId(w.id);
                  setWindowForm({
                    label: w.label,
                    open_date: w.open_date.slice(0, 16),
                    close_date: w.close_date.slice(0, 16),
                    active: w.active,
                    allow_queue_after_close: w.allow_queue_after_close,
                  });
                }}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-surface-card border rounded-xl p-5">
        <a href="/api/admin/merch/export">
          <Button variant="secondary">Export supplier CSV</Button>
        </a>
      </section>
    </div>
  );
}
