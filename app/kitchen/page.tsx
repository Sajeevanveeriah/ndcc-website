'use client';

import { useEffect, useMemo, useState } from 'react';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal from '@/components/common/ScrollReveal';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { formatCurrency, validateEmail, validatePhone } from '@/lib/utils';

type KitchenItem = { id: string; name: string; description: string; image_url?: string | null; price: number; is_available: boolean };

const FALLBACK_KITCHEN_MENU = {
  menuName: 'Kitchen Menu',
  items: [] as KitchenItem[],
};

export default function KitchenPage() {
  const [menuName, setMenuName] = useState('Kitchen Menu');
  const [items, setItems] = useState<KitchenItem[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('');
  const [formError, setFormError] = useState('');
  const [hpField, setHpField] = useState('');
  const [submittedAt, setSubmittedAt] = useState(Date.now());

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/kitchen/menu', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.data) {
        setMenuName(data.data.menu?.name || 'Kitchen Menu');
        setItems(data.data.items || []);
      } else {
        setMenuName(FALLBACK_KITCHEN_MENU.menuName);
        setItems(FALLBACK_KITCHEN_MENU.items);
      }
    })().catch(() => {
      setMenuName(FALLBACK_KITCHEN_MENU.menuName);
      setItems(FALLBACK_KITCHEN_MENU.items);
    });
  }, []);

  const selectedItems = useMemo(
    () => items.filter((i) => (cart[i.id] || 0) > 0).map((i) => ({ ...i, quantity: cart[i.id] })),
    [items, cart]
  );
  const total = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || selectedItems.length === 0) return;
    if (!validateEmail(email)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (!validatePhone(phone)) {
      setFormError('Please enter a valid phone number.');
      return;
    }
    setFormError('');
    const res = await fetch('/api/kitchen/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        items: selectedItems.map((i) => ({ item_id: i.id, quantity: i.quantity })),
        hp_field: hpField,
        submitted_at: submittedAt,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || 'Unable to submit kitchen order.');
      return;
    }
    const bankSummary = data?.bank_details?.bsb
      ? ` Bank: ${data.bank_details.account_name}, BSB ${data.bank_details.bsb}, Account ${data.bank_details.account_number}.`
      : '';
    setStatus(`Order submitted. Payment reference: ${data.payment_reference}.${bankSummary} Example reference format: NDCC-YYYYMMDD-1234`);
    setCart({});
    setName('');
    setEmail('');
    setPhone('');
    setHpField('');
    setSubmittedAt(Date.now());
  }

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">Kitchen</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">Order from this week&rsquo;s canteen menu.</p></ScrollReveal>
        </div>
      </section>
      <section className="section-padding">
        <div className="container-width max-w-4xl mx-auto space-y-8">
          <h2 className="section-title">{menuName}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4 space-y-2">
                  {item.image_url && (
                    <div className="w-full h-36 rounded-lg bg-gray-50 overflow-hidden flex items-center justify-center p-2">
                      <SafeImage
                        src={item.image_url}
                        alt={`${item.name} menu item`}
                        width={240}
                        height={144}
                        className="max-h-full max-w-full object-contain"
                        fallback={<div className="h-full w-full bg-gray-50" aria-hidden="true" />}
                      />
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{item.name}</h3>
                      <p className="text-sm text-gray-600">{item.description}</p>
                    </div>
                    <p className="font-semibold">{formatCurrency(item.price)}</p>
                  </div>
                  {!item.is_available ? (
                    <p className="text-sm text-red-600">Sold out</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setCart((c) => ({ ...c, [item.id]: Math.max(0, (c[item.id] || 0) - 1) }))}>-</Button>
                      <span>{cart[item.id] || 0}</span>
                      <Button size="sm" variant="ghost" onClick={() => setCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }))}>+</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="text-lg font-semibold">Kitchen Order</h3>
              <p className="text-sm text-gray-600">Total: {formatCurrency(total)}</p>
              <form className="space-y-3" onSubmit={submitOrder}>
                <input type="text" name="website" className="hidden" value={hpField} onChange={(e) => setHpField(e.target.value)} tabIndex={-1} autoComplete="off" />
                <Input id="k_name" label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
                <Input id="k_email" label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input id="k_phone" label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                {formError && <p className="text-sm text-red-600">{formError}</p>}
                <Button type="submit" disabled={selectedItems.length === 0}>Submit Kitchen Order</Button>
              </form>
              {status && <p className="text-sm text-gray-700">{status}</p>}
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
