'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal from '@/components/common/ScrollReveal';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import OrderPaymentOptions from '@/components/payments/OrderPaymentOptions';
import { formatCurrency, validateEmail, validatePhone } from '@/lib/utils';

type KitchenItem = { id: string; name: string; description: string; image_url?: string | null; price: number; is_available: boolean };

type OrderConfirmation = {
  order_id: string;
  total_amount: number;
  payment_reference: string;
  bank_details: { account_name: string; bsb: string; account_number: string } | null;
};
type OrderWindow = { open: boolean; message: string };

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
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [status, setStatus] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [hpField, setHpField] = useState('');
  const [submittedAt, setSubmittedAt] = useState(Date.now());
  const [orderWindow, setOrderWindow] = useState<OrderWindow>({ open: false, message: 'Checking the online ordering window...' });

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

  useEffect(() => { void fetch('/api/kitchen/window', { cache: 'no-store' }).then(r => r.json()).then(data => setOrderWindow(data.data)); }, []);

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
    setSubmitStatus('idle');
    setStatus('');
    setOrderConfirmation(null);
    setSubmitting(true);
    try {
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
        setSubmitStatus('error');
        setStatus(data.error || 'Unable to submit kitchen order.');
        return;
      }
      setSubmitStatus('success');
      setStatus('Your kitchen order has been submitted.');
      setOrderConfirmation({
        order_id: data.order_id || '',
        total_amount: Number(data.total_amount || 0),
        payment_reference: data.payment_reference || '',
        bank_details: data.bank_details || null,
      });
      setCart({});
      setName('');
      setEmail('');
      setPhone('');
      setHpField('');
      setSubmittedAt(Date.now());
    } catch {
      setSubmitStatus('error');
      setStatus('Unable to submit kitchen order. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
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
                    <div className="w-full h-36 rounded-lg bg-surface-page overflow-hidden flex items-center justify-center p-2">
                      <SafeImage
                        src={item.image_url}
                        alt={`${item.name} menu item`}
                        width={240}
                        height={144}
                        className="max-h-full max-w-full object-contain"
                        fallback={<div className="h-full w-full bg-surface-page" aria-hidden="true" />}
                      />
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{item.name}</h3>
                      <p className="text-sm text-content-muted">{item.description}</p>
                    </div>
                    <p className="font-semibold">{formatCurrency(item.price)}</p>
                  </div>
                  {!item.is_available ? (
                    <p className="text-sm text-red-600">Sold out</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-11 w-11 p-0 border border-edge-subtle dark:border-slate-600" aria-label={`Remove one ${item.name}`} onClick={() => setCart((c) => ({ ...c, [item.id]: Math.max(0, (c[item.id] || 0) - 1) }))}>-</Button>
                      <span className="w-6 text-center font-semibold">{cart[item.id] || 0}</span>
                      <Button size="sm" variant="ghost" className="h-11 w-11 p-0 border border-edge-subtle dark:border-slate-600" aria-label={`Add one ${item.name}`} onClick={() => setCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }))}>+</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="text-lg font-display font-bold uppercase tracking-wide text-maroon-800 dark:text-maroon-200">Kitchen Order</h3>
              <p className="font-display text-lg font-bold text-content-primary">Total: {formatCurrency(total)}</p>
              <p className={orderWindow.open ? 'text-sm text-green-700' : 'text-sm text-amber-800'}>{orderWindow.message}</p>
              <form className="space-y-3" onSubmit={submitOrder}>
                <input type="text" name="website" className="hidden" value={hpField} onChange={(e) => setHpField(e.target.value)} tabIndex={-1} autoComplete="off" />
                <Input id="k_name" label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
                <Input id="k_email" label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input id="k_phone" label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}
                <Button type="submit" disabled={selectedItems.length === 0 || !orderWindow.open} isLoading={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Kitchen Order'}
                </Button>
              </form>
              {submitStatus === 'success' && status && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3" role="alert">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-700 mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="text-green-800 font-body font-semibold">Order submitted</p>
                      <p className="text-green-700 font-body text-sm mt-1">{status}</p>
                    </div>
                  </div>
                  {orderConfirmation?.order_id && orderConfirmation.total_amount > 0 && (
                    <OrderPaymentOptions
                      orderId={orderConfirmation.order_id}
                      totalAmount={orderConfirmation.total_amount}
                      paymentReference={orderConfirmation.payment_reference}
                      bankDetails={orderConfirmation.bank_details}
                      returnPath="/kitchen"
                    />
                  )}
                </div>
              )}
              {submitStatus === 'error' && status && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3" role="alert">
                  <XCircle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-red-800 font-body font-semibold">Something went wrong</p>
                    <p className="text-red-700 font-body text-sm mt-1">{status}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
