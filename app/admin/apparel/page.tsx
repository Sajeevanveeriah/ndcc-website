'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type ApparelProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  sizes: string[];
  customisable: boolean;
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

  const [productForm, setProductForm] = useState({
    slug: '',
    name: '',
    description: '',
    price: '0',
    sizes: 'XS,S,M,L,XL',
    customisable: false,
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
    const [pRes, wRes] = await Promise.all([
      fetch('/api/admin/resources/apparelProducts', { cache: 'no-store' }),
      fetch('/api/admin/resources/merchWindows', { cache: 'no-store' }),
    ]);
    const pData = await pRes.json();
    const wData = await wRes.json();
    if (pRes.ok) setProducts(pData.data || []);
    if (wRes.ok) setWindows(wData.data || []);
  }

  useEffect(() => { loadAll(); }, []);

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/resources/apparelProducts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: productForm.slug.trim(),
        name: productForm.name.trim(),
        description: productForm.description.trim(),
        price: Number(productForm.price || 0),
        sizes: productForm.sizes.split(',').map((s) => s.trim()).filter(Boolean),
        customisable: productForm.customisable,
        active: productForm.active,
      }),
    });
    setStatus(res.ok ? 'Product saved.' : 'Failed to save product.');
    if (res.ok) {
      setProductForm({ slug: '', name: '', description: '', price: '0', sizes: 'XS,S,M,L,XL', customisable: false, active: true });
      loadAll();
    }
  }

  async function createWindow(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/resources/merchWindows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(windowForm),
    });
    setStatus(res.ok ? 'Window saved.' : 'Failed to save window.');
    if (res.ok) {
      setWindowForm({ label: '', open_date: '', close_date: '', active: true, allow_queue_after_close: true });
      loadAll();
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-display font-bold">Apparel & Merch Windows</h1>
      {status && <p className="text-sm text-gray-600">{status}</p>}

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Add Apparel Product</h2>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={createProduct}>
          <Input id="slug" label="Slug" required value={productForm.slug} onChange={(e) => setProductForm((v) => ({ ...v, slug: e.target.value }))} />
          <Input id="name" label="Name" required value={productForm.name} onChange={(e) => setProductForm((v) => ({ ...v, name: e.target.value }))} />
          <Input id="price" label="Price" type="number" required value={productForm.price} onChange={(e) => setProductForm((v) => ({ ...v, price: e.target.value }))} />
          <Input id="sizes" label="Sizes CSV" value={productForm.sizes} onChange={(e) => setProductForm((v) => ({ ...v, sizes: e.target.value }))} />
          <Input id="description" label="Description" value={productForm.description} onChange={(e) => setProductForm((v) => ({ ...v, description: e.target.value }))} />
          <div className="flex items-end gap-4">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={productForm.customisable} onChange={(e) => setProductForm((v) => ({ ...v, customisable: e.target.checked }))} />Customisable</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={productForm.active} onChange={(e) => setProductForm((v) => ({ ...v, active: e.target.checked }))} />Active</label>
          </div>
          <div className="md:col-span-2"><Button type="submit">Save Product</Button></div>
        </form>
        <ul className="text-sm text-gray-700 space-y-1">
          {products.map((p) => <li key={p.id}>{p.name} · ${p.price} · {p.sizes.join('/')}</li>)}
        </ul>
      </section>

      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Add Merch Window</h2>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={createWindow}>
          <Input id="label" label="Label" required value={windowForm.label} onChange={(e) => setWindowForm((v) => ({ ...v, label: e.target.value }))} />
          <Input id="open_date" label="Open date" type="datetime-local" required value={windowForm.open_date} onChange={(e) => setWindowForm((v) => ({ ...v, open_date: e.target.value }))} />
          <Input id="close_date" label="Close date" type="datetime-local" required value={windowForm.close_date} onChange={(e) => setWindowForm((v) => ({ ...v, close_date: e.target.value }))} />
          <div className="flex items-end gap-4">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={windowForm.active} onChange={(e) => setWindowForm((v) => ({ ...v, active: e.target.checked }))} />Active</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={windowForm.allow_queue_after_close} onChange={(e) => setWindowForm((v) => ({ ...v, allow_queue_after_close: e.target.checked }))} />Allow queue after close</label>
          </div>
          <div className="md:col-span-2"><Button type="submit">Save Window</Button></div>
        </form>

        <ul className="text-sm text-gray-700 space-y-1">
          {windows.map((w) => <li key={w.id}>{w.label} · {new Date(w.open_date).toLocaleDateString()} - {new Date(w.close_date).toLocaleDateString()} · {w.allow_queue_after_close ? 'Queue enabled' : 'Queue disabled'}</li>)}
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
