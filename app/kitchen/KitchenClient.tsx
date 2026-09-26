'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal from '@/components/common/ScrollReveal';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import MealCollectionSelector from '@/components/payments/MealCollectionSelector';
import { isMealCollectionWindow, mealCollectionLabel, mealServiceLabel, type MealCollectionWindow } from '@/lib/meal-collection';
import OrderPaymentOptions from '@/components/payments/OrderPaymentOptions';
import { formatCurrency, validateEmail, validatePhone } from '@/lib/utils';

export type KitchenItem = { id: string; name: string; description: string; image_url?: string | null; price: number; is_available: boolean };

type OrderConfirmation = {
  collection_window: MealCollectionWindow;
  service_date: string;
  revision: number;
  editing: boolean;
  payment_status: string;
  order_id: string;
  total_amount: number;
  payment_reference: string;
  bank_details: { account_name: string; bsb: string; account_number: string } | null;
};
type OrderWindow = { open: boolean; message: string; serviceDate?: string };

const FALLBACK_KITCHEN_MENU = {
  menuName: 'Kitchen Menu',
  items: [] as KitchenItem[],
};

export default function KitchenPage({ initialMenuName, initialItems }: { initialMenuName: string; initialItems: KitchenItem[] }) {
  const [menuName, setMenuName] = useState(initialMenuName);
  const [items, setItems] = useState<KitchenItem[]>(initialItems);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [collection, setCollection] = useState<MealCollectionWindow | ''>('');
  const [collectionError, setCollectionError] = useState(false);
  const [draftToken, setDraftToken] = useState('');
  const [restored, setRestored] = useState(false);
  const [storageError, setStorageError] = useState('');
  const submitLock = useRef(false);

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

  useEffect(() => { void fetch('/api/kitchen/window', { cache: 'no-store' }).then(r => r.json()).then(data => { if (data.data) setOrderWindow(data.data); }).catch(() => setOrderWindow({ open: false, message: 'Unable to check ordering availability. Reload to retry.' })); }, []);

  const locked = Boolean(orderConfirmation && !orderConfirmation.editing);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = JSON.parse(sessionStorage.getItem('ndcc-meal-draft-v1') || 'null');
        const token = saved?.token || crypto.randomUUID();
        setDraftToken(token);
        if (saved) {
          setCart(saved.cart || {}); setName(saved.name || ''); setEmail(saved.email || ''); setPhone(saved.phone || '');
          setCollection(isMealCollectionWindow(saved.collection) ? saved.collection : '');
          const response = await fetch('/api/kitchen/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'resume', draft_token: token }) });
          if (!active) return;
          if (response.ok) {
            const order = await response.json();
            setOrderConfirmation(order); setSubmitStatus('success'); setStatus('Your saved kitchen order is available below.');
            if (!order.editing && order.draft) {
              setCollection(order.collection_window); setName(order.draft.name); setEmail(order.draft.email); setPhone(order.draft.phone);
              setCart(Object.fromEntries(order.draft.items.map((item: { item_id: string; quantity: number }) => [item.item_id, item.quantity])));
            }
          } else if (response.status !== 404) {
            throw new Error('Unable to restore your saved order. Reload before continuing.');
          }
        }
        if (active) setRestored(true);
      } catch {
        if (active) setStorageError('Your meal draft could not be restored or saved in this browser. Reload before continuing.');
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!restored || !draftToken) return;
    try {
      sessionStorage.setItem('ndcc-meal-draft-v1', JSON.stringify({ token: draftToken, cart, name, email, phone, collection }));
    } catch { setStorageError('Your meal draft could not be saved in this browser. Reload before continuing.'); }
  }, [restored, draftToken, cart, name, email, phone, collection]);

  async function editOrder() {
    if (!orderConfirmation || submitLock.current) return;
    submitLock.current = true; setSubmitting(true); setFormError('');
    try {
      const response = await fetch('/api/kitchen/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit', draft_token: draftToken, revision: orderConfirmation.revision }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setOrderConfirmation(result); setStatus('Edit your order, then save it before payment.');
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Unable to edit order.'); }
    finally { submitLock.current = false; setSubmitting(false); }
  }

  const selectedItems = useMemo(
    () => items.filter((i) => (cart[i.id] || 0) > 0).map((i) => ({ ...i, quantity: cart[i.id] })),
    [items, cart]
  );
  const total = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current || !restored || locked || storageError) return;
    if (!isMealCollectionWindow(collection)) {
      setCollectionError(true);
      return;
    }
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
    submitLock.current = true;
    setSubmitting(true);
    try {
      const res = await fetch('/api/kitchen/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_token: draftToken,
          revision: orderConfirmation?.revision || 0,
          collection_window: collection,
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
        collection_window: data.collection_window, service_date: data.service_date, revision: data.revision, editing: false, payment_status: data.payment_status,
        order_id: data.order_id || '',
        total_amount: Number(data.total_amount || 0),
        payment_reference: data.payment_reference || '',
        bank_details: data.bank_details || null,
      });
      setHpField('');
      setSubmittedAt(Date.now());
    } catch {
      setSubmitStatus('error');
      setStatus('Unable to submit kitchen order. Please check your connection and try again.');
    } finally {
      submitLock.current = false;
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
                      <Button size="sm" variant="ghost" className="h-11 w-11 p-0 border border-edge-subtle dark:border-slate-600" aria-label={`Remove one ${item.name}`} disabled={locked || submitting || !restored || Boolean(storageError)} onClick={() => setCart((c) => ({ ...c, [item.id]: Math.max(0, (c[item.id] || 0) - 1) }))}>-</Button>
                      <span className="w-6 text-center font-semibold">{cart[item.id] || 0}</span>
                      <Button size="sm" variant="ghost" className="h-11 w-11 p-0 border border-edge-subtle dark:border-slate-600" aria-label={`Add one ${item.name}`} disabled={locked || submitting || !restored || Boolean(storageError)} onClick={() => setCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }))}>+</Button>
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
              <p className={orderWindow.open ? 'text-sm text-green-700 dark:text-green-300' : 'text-sm text-amber-800 dark:text-amber-200'}>{orderWindow.message}</p>
              {storageError && <p role="alert" className="text-red-700 dark:text-red-300">{storageError}</p>}
              <p className="text-sm">Service: {mealServiceLabel(orderConfirmation?.service_date || orderWindow.serviceDate)}</p>
              <form className="space-y-3" onSubmit={submitOrder}>
                <fieldset disabled={locked || submitting || !restored || Boolean(storageError)} className="min-w-0 space-y-3">
                <MealCollectionSelector value={collection} onChange={(value) => { setCollection(value); setCollectionError(false); }} showError={collectionError} />
                {collection && <p className="text-sm">Collection: <strong>{mealCollectionLabel(collection)}</strong></p>}
                <input type="text" name="website" className="hidden" value={hpField} onChange={(e) => setHpField(e.target.value)} tabIndex={-1} autoComplete="off" />
                <Input id="k_name" label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
                <Input id="k_email" label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input id="k_phone" label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}
                <Button type="submit" disabled={selectedItems.length === 0 || !orderWindow.open} isLoading={submitting}>
                  {submitting ? 'Saving...' : orderConfirmation ? 'Save changes before payment' : 'Continue to payment'}
                </Button>
                </fieldset>
              </form>
              {orderConfirmation?.payment_status === 'paid' && <Button type="button" variant="secondary" onClick={() => {
                setDraftToken(crypto.randomUUID()); setOrderConfirmation(null); setCart({}); setCollection('');
                setCollectionError(false); setSubmitStatus('idle'); setStatus(''); setSubmittedAt(Date.now());
              }}>Start a new meal order</Button>}
              {locked && orderConfirmation?.payment_status !== 'paid' && <Button type="button" variant="secondary" isLoading={submitting} onClick={editOrder}>Edit order or collection time</Button>}
              {submitStatus === 'success' && status && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3" role="alert">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-700 mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="text-green-800 font-body font-semibold">Order saved</p>
                      <p className="text-green-900">{mealCollectionLabel(orderConfirmation?.collection_window)} - {mealServiceLabel(orderConfirmation?.service_date)} (Australia/Melbourne)</p>
                      <p className="text-green-700 font-body text-sm mt-1">{status}</p>
                    </div>
                  </div>
                  {orderConfirmation?.order_id && !orderConfirmation.editing && orderConfirmation.payment_status !== 'paid' && orderConfirmation.total_amount > 0 && (
                    <OrderPaymentOptions
                      mealDraftToken={draftToken}
                      mealRevision={orderConfirmation.revision}
                      orderId={orderConfirmation.order_id}
                      customerEmail={email}
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
