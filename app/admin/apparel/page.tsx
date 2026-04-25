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
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingWindowId, setEditingWindowId] = useState<string | null>(null);

  const [productForm, setProductForm] = useState({
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
  });

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
    };

    const res = await fetch('/api/admin/resources/apparelProducts', {
      method: editingProductId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingProductId ? { id: editingProductId, ...payload } : payload),
    });
    try {
      await parseApiResponse(res);
      setStatus(editingProductId ? 'Product updated.' : 'Product saved.');
      setProductForm({ slug: '', name: '', description: '', price: '0', sizes: 'XS,S,M,L,XL', image_url: '', customisable: false, category: 'General', display_order: '1', order_guidance: '', size_guidance: '', active: true });
      setEditingProductId(null);
      loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save product.');
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
    });
  }

  async function createWindow(e: React.FormEvent) {
    e.preventDefault();
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
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-display font-bold">Apparel & Merch Windows</h1>
      {status && <p className="text-sm text-gray-600">{status}</p>}

      <section className="bg-white border rounded-xl p-5 space-y-4">
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
          <div className="flex items-end gap-4">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={productForm.customisable} onChange={(e) => setProductForm((v) => ({ ...v, customisable: e.target.checked }))} />Customisable</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={productForm.active} onChange={(e) => setProductForm((v) => ({ ...v, active: e.target.checked }))} />Active</label>
          </div>
          <div className="md:col-span-2 flex gap-2">
            <Button type="submit">{editingProductId ? 'Update Product' : 'Save Product'}</Button>
            {editingProductId && (
              <Button type="button" variant="secondary" onClick={() => {
                setEditingProductId(null);
                setProductForm({ slug: '', name: '', description: '', price: '0', sizes: 'XS,S,M,L,XL', image_url: '', customisable: false, category: 'General', display_order: '1', order_guidance: '', size_guidance: '', active: true });
              }}
              >
                Cancel Edit
              </Button>
            )}
          </div>
        </form>
        <ul className="text-sm text-gray-700 space-y-1">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span>{p.name} · ${p.price} · {p.category} · order {p.display_order} · {p.sizes.join('/')}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => editProduct(p)}>Edit</Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-4">
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
            <Button type="submit">{editingWindowId ? 'Update Window' : 'Save Window'}</Button>
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

        <ul className="text-sm text-gray-700 space-y-1">
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

      <section className="bg-white border rounded-xl p-5">
        <a href="/api/admin/merch/export">
          <Button variant="secondary">Export supplier CSV</Button>
        </a>
      </section>
    </div>
  );
}
