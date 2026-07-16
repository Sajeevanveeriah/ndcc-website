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
  image_alt?: string | null;
  // Payment-readiness fields (absent until the payment migration is applied).
  payment_mode?: string | null;
  payment_link_url?: string | null;
  stripe_price_id?: string | null;
  checkout_enabled?: boolean | null;
  fulfilment_notes?: string | null;
  order_email?: string | null;
};

type ApparelProductOption = {
  id: string;
  product_id: string;
  option_group: string;
  option_value: string;
  option_label: string;
  price_delta: number;
  is_default: boolean;
  active: boolean;
  display_order: number;
};

const EMPTY_OPTION_FORM = {
  product_id: '',
  option_group: '',
  option_value: '',
  option_label: '',
  price_delta: '0',
  is_default: false,
  active: true,
  display_order: '1',
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
  // No default sizes: size ranges must come from verified supplier data.
  sizes: '',
  image_url: '',
  image_alt: '',
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
  const [options, setOptions] = useState<ApparelProductOption[]>([]);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingWindowId, setEditingWindowId] = useState<string | null>(null);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);

  const [productForm, setProductForm] = useState({ ...EMPTY_PRODUCT_FORM });
  const [optionForm, setOptionForm] = useState({ ...EMPTY_OPTION_FORM });

  const [windowForm, setWindowForm] = useState({
    label: '',
    open_date: '',
    close_date: '',
    active: true,
    allow_queue_after_close: true,
  });

  async function loadAll() {
    try {
      const [pRes, wRes, oRes] = await Promise.all([
        fetch('/api/admin/resources/apparelProducts', { cache: 'no-store' }),
        fetch('/api/admin/resources/merchWindows', { cache: 'no-store' }),
        fetch('/api/admin/resources/apparelProductOptions', { cache: 'no-store' }),
      ]);
      const [pData, wData] = await Promise.all([
        parseApiResponse<{ data?: ApparelProduct[] }>(pRes),
        parseApiResponse<{ data?: MerchWindow[] }>(wRes),
      ]);
      setProducts(pData.data || []);
      setWindows(wData.data || []);
      // Options degrade quietly until the option-model migration is applied.
      try {
        const oData = await parseApiResponse<{ data?: ApparelProductOption[] }>(oRes);
        setOptions(oData.data || []);
      } catch {
        setOptions([]);
      }
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
      image_alt: productForm.image_alt.trim(),
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
      image_alt: product.image_alt || '',
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

  async function saveOption(e: React.FormEvent) {
    e.preventDefault();
    const delta = Number(optionForm.price_delta || 0);
    if (Number.isNaN(delta)) {
      setStatus('Option price delta must be a number.');
      return;
    }
    if (!optionForm.product_id) {
      setStatus('Choose the product this option belongs to.');
      return;
    }
    const payload = {
      product_id: optionForm.product_id,
      option_group: optionForm.option_group.trim(),
      option_value: optionForm.option_value.trim(),
      option_label: optionForm.option_label.trim(),
      price_delta: delta,
      is_default: optionForm.is_default,
      active: optionForm.active,
      display_order: Number(optionForm.display_order || 0),
    };
    setSaving(true);
    try {
      const res = await fetch('/api/admin/resources/apparelProductOptions', {
        method: editingOptionId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingOptionId ? { id: editingOptionId, ...payload } : payload),
      });
      await parseApiResponse(res);
      setStatus(editingOptionId ? 'Option updated.' : 'Option saved.');
      setOptionForm({ ...EMPTY_OPTION_FORM });
      setEditingOptionId(null);
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save option.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleOptionActive(option: ApparelProductOption) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/resources/apparelProductOptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: option.id, active: !option.active }),
      });
      await parseApiResponse(res);
      setStatus(option.active ? 'Option disabled.' : 'Option enabled.');
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update option.');
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
          <Input id="image_alt" label="Image alt text" value={productForm.image_alt} onChange={(e) => setProductForm((v) => ({ ...v, image_alt: e.target.value }))} />
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
        <h2 className="text-lg font-semibold">{editingOptionId ? 'Edit Product Option' : 'Add Product Option'}</h2>
        <p className="text-sm text-content-muted">
          Options are price-changing selections (e.g. Sleeve length → Long sleeve +$1.00). Each option group is a
          single-choice selector on the product card; the default row is the zero-surcharge baseline. The server
          recomputes order prices from these rows.
        </p>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={saveOption}>
          <div>
            <label htmlFor="option_product" className="form-label">Product</label>
            <select
              id="option_product"
              className="w-full px-3 py-2 border border-edge-strong rounded-lg text-sm font-body focus:border-maroon-500 focus:ring-1 focus:ring-maroon-500 outline-none bg-surface-card"
              value={optionForm.product_id}
              onChange={(e) => setOptionForm((v) => ({ ...v, product_id: e.target.value }))}
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.slug})</option>
              ))}
            </select>
          </div>
          <Input id="option_group" label="Option group (e.g. Sleeve length)" required value={optionForm.option_group} onChange={(e) => setOptionForm((v) => ({ ...v, option_group: e.target.value }))} />
          <Input id="option_value" label="Machine value (e.g. long-sleeve)" required value={optionForm.option_value} onChange={(e) => setOptionForm((v) => ({ ...v, option_value: e.target.value }))} />
          <Input id="option_label" label="Display label (e.g. Long sleeve)" required value={optionForm.option_label} onChange={(e) => setOptionForm((v) => ({ ...v, option_label: e.target.value }))} />
          <Input id="option_price_delta" label="Price delta (AUD, e.g. 1.00)" type="number" value={optionForm.price_delta} onChange={(e) => setOptionForm((v) => ({ ...v, price_delta: e.target.value }))} />
          <Input id="option_display_order" label="Display order" type="number" value={optionForm.display_order} onChange={(e) => setOptionForm((v) => ({ ...v, display_order: e.target.value }))} />
          <div className="flex items-end gap-4">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={optionForm.is_default} onChange={(e) => setOptionForm((v) => ({ ...v, is_default: e.target.checked }))} />Default choice</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={optionForm.active} onChange={(e) => setOptionForm((v) => ({ ...v, active: e.target.checked }))} />Active</label>
          </div>
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit" isLoading={saving}>{editingOptionId ? 'Update Option' : 'Save Option'}</Button>
            {editingOptionId && (
              <Button type="button" variant="secondary" onClick={() => { setEditingOptionId(null); setOptionForm({ ...EMPTY_OPTION_FORM }); }}>
                Cancel Edit
              </Button>
            )}
          </div>
        </form>
        <ul className="text-sm text-content-secondary space-y-1">
          {options.map((o) => {
            const product = products.find((p) => p.id === o.product_id);
            return (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold mr-2 ${o.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-content-muted'}`}>
                    {o.active ? 'Active' : 'Disabled'}
                  </span>
                  {product?.name || 'Unknown product'} · {o.option_group}: {o.option_label}
                  {Number(o.price_delta) !== 0 && ` (+$${Number(o.price_delta).toFixed(2)})`}
                  {o.is_default && ' · default'}
                </span>
                <span className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => {
                    setEditingOptionId(o.id);
                    setOptionForm({
                      product_id: o.product_id,
                      option_group: o.option_group,
                      option_value: o.option_value,
                      option_label: o.option_label,
                      price_delta: String(o.price_delta ?? 0),
                      is_default: o.is_default,
                      active: o.active,
                      display_order: String(o.display_order ?? 0),
                    });
                  }}
                  >
                    Edit
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => toggleOptionActive(o)}>
                    {o.active ? 'Disable' : 'Enable'}
                  </Button>
                </span>
              </li>
            );
          })}
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
