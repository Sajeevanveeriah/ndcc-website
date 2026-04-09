'use client';

import { Suspense, useState, useEffect, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Card, { CardContent, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input, { Textarea } from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { PRODUCTS, CLUB_NAME } from '@/lib/constants';
import { formatCurrency, validateEmail, validatePhone, cn } from '@/lib/utils';
import { OrderItem } from '@/lib/types';

interface CartItem extends OrderItem {
  id: string;
}

type MerchandiseWindow = {
  id: string;
  label: string;
  open_date: string;
  close_date: string;
  allow_queue_after_close: boolean;
};

type DisplayProduct = {
  id: string;
  name: string;
  price: number;
  description: string;
  sizes: string[];
  image: string;
  customisable?: boolean;
  category?: string;
};

type ApiProduct = {
  slug: string;
  name: string;
  description: string;
  price: number;
  sizes: string[];
  image_url: string;
  customisable: boolean;
  category?: string;
  display_order?: number;
  order_guidance?: string | null;
  size_guidance?: string | null;
};

const PRODUCT_GRADIENTS: Record<string, string> = {
  'playing-shirt': 'from-gray-100 to-gray-300',
  'playing-trousers': 'from-gray-50 to-gray-200',
  'club-hoodie': 'from-maroon-700 to-maroon-900',
  'training-tee': 'from-maroon-600 to-maroon-800',
  'club-polo': 'from-maroon-600 to-maroon-800',
  'club-cap': 'from-maroon-700 to-maroon-950',
  'training-singlet': 'from-maroon-500 to-maroon-700',
  'cricket-socks': 'from-maroon-400 to-maroon-600',
};

const PRODUCT_ICONS: Record<string, { path: string; textColor: string }> = {
  'playing-shirt': {
    path: 'M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
    textColor: 'text-maroon-800',
  },
  'playing-trousers': {
    path: 'M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
    textColor: 'text-maroon-800',
  },
  'club-hoodie': {
    path: 'M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
    textColor: 'text-white/70',
  },
  'training-tee': {
    path: 'M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
    textColor: 'text-white/70',
  },
  'club-polo': {
    path: 'M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
    textColor: 'text-white/70',
  },
  'club-cap': {
    path: 'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z',
    textColor: 'text-white/70',
  },
  'training-singlet': {
    path: 'M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
    textColor: 'text-white/70',
  },
  'cricket-socks': {
    path: 'M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25',
    textColor: 'text-white/70',
  },
};

function isStripeConfigured(): boolean {
  return false;
}

export default function MerchandisePage() {
  return (
    <Suspense>
      <MerchandiseContent />
    </Suspense>
  );
}

function MerchandiseContent() {
  const searchParams = useSearchParams();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [sizeErrors, setSizeErrors] = useState<Record<string, string>>({});
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [customNumbers, setCustomNumbers] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
    hp_field: '',
    submitted_at: Date.now(),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'cancelled' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [orderConfirmation, setOrderConfirmation] = useState<{
    payment_reference: string;
    bank_details: { account_name: string; bsb: string; account_number: string };
  } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<DisplayProduct[]>(PRODUCTS.map((product) => ({ ...product, category: 'General' })));
  const [heroContent, setHeroContent] = useState<{ title: string; body: string; orderTitle: string; orderBody: string }>({
    title: 'Club Merchandise',
    body: `Show your Dinos pride with official ${CLUB_NAME} gear. All merchandise is available for order online and collection from the club.`,
    orderTitle: 'Ordering Information',
    orderBody: '',
  });
  const [windowState, setWindowState] = useState<{ processing_open: boolean; queue_allowed: boolean; current_window: MerchandiseWindow | null; next_window: MerchandiseWindow | null }>({
    processing_open: true,
    queue_allowed: true,
    current_window: null,
    next_window: null,
  });

  const stripeEnabled = isStripeConfigured();

  useEffect(() => {
    document.title = 'Club Merchandise | NDCC Dinos';

    if (searchParams.get('success') === 'true') {
      setSubmitStatus('success');
    } else if (searchParams.get('cancelled') === 'true') {
      setSubmitStatus('cancelled');
    }

    void (async () => {
      try {
        const [productsRes, windowsRes, blocksRes] = await Promise.all([
          fetch('/api/apparel/products', { cache: 'no-store' }),
          fetch('/api/apparel/windows', { cache: 'no-store' }),
          fetch('/api/public/content-blocks?key=merch.hero&key=merch.ordering', { cache: 'no-store' }),
        ]);
        const productsData = await productsRes.json();
        const windowsData = await windowsRes.json();
        const blocksPayload = await blocksRes.json();
        const blocks = blocksPayload?.data || {};
        const orderingBody = blocks['merch.ordering']?.body || '';
        setHeroContent({
          title: blocks['merch.hero']?.title || 'Club Merchandise',
          body: blocks['merch.hero']?.body || `Show your Dinos pride with official ${CLUB_NAME} gear. All merchandise is available for order online and collection from the club.`,
          orderTitle: blocks['merch.ordering']?.title || 'Ordering Information',
          orderBody: orderingBody.startsWith('Use this section to provide') ? '' : orderingBody,
        });
        if (productsRes.ok && Array.isArray(productsData.data) && productsData.data.length > 0) {
          setProducts(productsData.data
            .sort((a: ApiProduct, b: ApiProduct) => (a.display_order ?? 9999) - (b.display_order ?? 9999))
            .map((p: ApiProduct) => ({
              id: p.slug,
              name: p.name,
              price: Number(p.price || 0),
              description: [p.description, p.order_guidance, p.size_guidance].filter(Boolean).join('\n\n'),
              sizes: Array.isArray(p.sizes) ? p.sizes : [],
              image: p.image_url || '',
              customisable: Boolean(p.customisable),
              category: p.category || 'General',
            })));
        }
        if (windowsRes.ok && windowsData.data) {
          setWindowState(windowsData.data);
        }
      } catch {
        // Keep safe defaults.
      }
    })();
  }, [searchParams]);

  function handleAddToOrder(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const size = selectedSizes[productId] || (product.sizes.length === 0 ? 'One Size' : '');
    if (!size) {
      setSizeErrors((prev) => ({ ...prev, [productId]: 'Please select a size' }));
      return;
    }
    setSizeErrors((prev) => ({ ...prev, [productId]: '' }));

    const qty = quantities[productId] || 1;
    const custom_name = product.customisable ? customNames[productId]?.trim() || undefined : undefined;
    const custom_number = product.customisable && customNumbers[productId]
      ? parseInt(customNumbers[productId], 10)
      : undefined;

    const existingIdx = cart.findIndex(
      (item) => item.id === productId && item.size === size && item.custom_name === custom_name && item.custom_number === custom_number
    );

    if (existingIdx >= 0) {
      setCart((prev) =>
        prev.map((item, idx) =>
          idx === existingIdx ? { ...item, quantity: item.quantity + qty } : item
        )
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          id: productId,
          name: product.name,
          size,
          quantity: qty,
          price: product.price,
          custom_name,
          custom_number: custom_number !== undefined && !isNaN(custom_number) ? custom_number : undefined,
        },
      ]);
    }

    setQuantities((prev) => ({ ...prev, [productId]: 1 }));
    if (product.customisable) {
      setCustomNames((prev) => ({ ...prev, [productId]: '' }));
      setCustomNumbers((prev) => ({ ...prev, [productId]: '' }));
    }
  }

  function handleRemoveFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCartQuantity(index: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item, i) =>
          i === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const groupedProducts = products.reduce<Record<string, DisplayProduct[]>>((acc, product) => {
    const group = product.category?.trim() || 'General';
    if (!acc[group]) acc[group] = [];
    acc[group].push(product);
    return acc;
  }, {});

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    if (!formData.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!validatePhone(formData.phone)) {
      errors.phone = 'Please enter a valid phone number';
    }
    if (cart.length === 0) errors.cart = 'Please add at least one item to your order';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      const endpoint = stripeEnabled ? '/api/checkout' : '/api/orders';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: formData.name,
          customer_email: formData.email,
          customer_phone: formData.phone,
          notes: formData.notes,
          items: cart.map(({ name, size, quantity, price, custom_name, custom_number }) => ({
            name,
            size,
            quantity,
            price,
            ...(custom_name ? { custom_name } : {}),
            ...(custom_number !== undefined ? { custom_number } : {}),
          })),
          total_amount: cartTotal,
          order_category: 'merch',
          merch_window_id: windowState.current_window?.id ?? windowState.next_window?.id ?? null,
          hp_field: formData.hp_field,
          submitted_at: formData.submitted_at,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      if (stripeEnabled && data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }

      // Non-Stripe fallback: surface payment reference and bank details
      setOrderConfirmation({
        payment_reference: data.payment_reference || '',
        bank_details: data.bank_details || { account_name: '', bsb: '', account_number: '' },
      });
      setSubmitStatus('success');
      setCart([]);
      setFormData({ name: '', email: '', phone: '', notes: '', hp_field: '', submitted_at: Date.now() });
      setFormErrors({});
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">{heroContent.title}</h1>
          <p className="page-hero-subtitle">
            {heroContent.body}
          </p>
        </div>
      </section>

      {/* Products Grid */}
      <section className="section-padding bg-sky-50">
        <div className="container-width">
          <h2 className="section-title mb-2">Products</h2>
          {heroContent.orderBody && (
            <div className="mb-6 rounded-xl border border-sky-200 bg-white p-4">
              <h3 className="font-display font-bold text-maroon-800">{heroContent.orderTitle}</h3>
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{heroContent.orderBody}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {!windowState.processing_open && (
              <div className="md:col-span-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 text-sm">
                Orders are currently outside the active merch window.
                {windowState.queue_allowed ? ' New orders will be queued for the next window.' : ' Ordering is temporarily unavailable.'}
              </div>
            )}
            {Object.entries(groupedProducts).map(([category, productsInCategory]) => (
              <div key={category} className="md:col-span-2 lg:col-span-3 xl:col-span-4">
                <h3 className="text-xl font-display font-bold text-maroon-800 mb-3">{category}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {productsInCategory.map((product) => {
                  const gradient = PRODUCT_GRADIENTS[product.id] || 'from-maroon-600 to-maroon-800';
                  const iconData = PRODUCT_ICONS[product.id];
                  return (
                    <Card key={product.id}>
                  {product.image ? (
                    <div
                      className="h-36 bg-cover bg-center"
                      style={{ backgroundImage: `url(${product.image})` }}
                      aria-label={`${product.name} image`}
                    />
                  ) : (
                    <div
                      className={`h-36 bg-gradient-to-br ${gradient} flex items-center justify-center`}
                      aria-hidden="true"
                    >
                      {iconData && (
                        <svg className={`w-12 h-12 ${iconData.textColor}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d={iconData.path} />
                        </svg>
                      )}
                    </div>
                  )}
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-bold text-gray-900 text-sm leading-tight">
                        {product.name}
                      </h3>
                      <Badge variant="default" className="flex-shrink-0">{formatCurrency(product.price)}</Badge>
                    </div>
                    <p className="font-body text-gray-600 text-xs">{product.description}</p>

                    {product.customisable && (
                      <Badge variant="info" className="text-xs">Customisable</Badge>
                    )}

                    {/* Size Selector */}
                    <div>
                      <p className="form-label text-xs">Size</p>
                      {product.sizes.length === 0 ? (
                        <p className="text-xs text-gray-500">No size selection required.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {product.sizes.map((size) => (
                            <button
                              key={size}
                              type="button"
                              className={cn(
                                'px-2.5 py-1 rounded-lg border text-xs font-body font-medium transition-colors',
                                selectedSizes[product.id] === size
                                  ? 'border-maroon-700 bg-maroon-700 text-white'
                                  : 'border-gray-300 text-gray-700 hover:border-maroon-400'
                              )}
                              onClick={() => {
                                setSelectedSizes((prev) => ({ ...prev, [product.id]: size }));
                                setSizeErrors((prev) => ({ ...prev, [product.id]: '' }));
                              }}
                              aria-pressed={selectedSizes[product.id] === size}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      )}
                      {sizeErrors[product.id] && (
                        <p className="mt-1 text-xs text-red-600">{sizeErrors[product.id]}</p>
                      )}
                    </div>

                    {/* Custom name/number for customisable products */}
                    {product.customisable && (
                      <div className="space-y-2">
                        <div>
                          <label htmlFor={`custom-name-${product.id}`} className="form-label text-xs">Name on Shirt (optional)</label>
                          <input
                            id={`custom-name-${product.id}`}
                            type="text"
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-body focus:border-maroon-500 focus:ring-1 focus:ring-maroon-500 outline-none"
                            placeholder="e.g. SMITH"
                            value={customNames[product.id] || ''}
                            onChange={(e) => setCustomNames((prev) => ({ ...prev, [product.id]: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label htmlFor={`custom-number-${product.id}`} className="form-label text-xs">Number on Shirt (optional)</label>
                          <input
                            id={`custom-number-${product.id}`}
                            type="number"
                            min={0}
                            max={99}
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-body focus:border-maroon-500 focus:ring-1 focus:ring-maroon-500 outline-none"
                            placeholder="0-99"
                            value={customNumbers[product.id] || ''}
                            onChange={(e) => setCustomNumbers((prev) => ({ ...prev, [product.id]: e.target.value }))}
                          />
                        </div>
                      </div>
                    )}

                    {/* Quantity Selector */}
                    <div>
                      <p className="form-label text-xs">Quantity</p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-colors text-sm"
                          onClick={() =>
                            setQuantities((prev) => ({
                              ...prev,
                              [product.id]: Math.max(1, (prev[product.id] || 1) - 1),
                            }))
                          }
                          aria-label="Decrease quantity"
                        >
                          -
                        </button>
                        <span className="font-body font-semibold text-gray-900 w-6 text-center text-sm">
                          {quantities[product.id] || 1}
                        </span>
                        <button
                          type="button"
                          className="w-8 h-8 rounded-lg border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-colors text-sm"
                          onClick={() =>
                            setQuantities((prev) => ({
                              ...prev,
                              [product.id]: Math.min(10, (prev[product.id] || 1) + 1),
                            }))
                          }
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleAddToOrder(product.id)}
                      className="w-full"
                    >
                      Add to Order
                    </Button>
                  </CardFooter>
                    </Card>
                  );
                })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Order Summary & Form */}
      <section className="section-padding bg-gray-50" aria-label="Order summary and checkout">
        <div className="container-width max-w-3xl mx-auto">
          <h2 className="section-title">Your Order</h2>

          {submitStatus === 'success' && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg space-y-3" role="alert">
              <p className="text-green-800 font-body font-semibold">Order confirmed!</p>
              {orderConfirmation?.payment_reference && (
                <div className="bg-white border border-green-300 rounded-lg p-3">
                  <p className="text-green-900 font-body text-sm font-semibold">Your Payment Reference:</p>
                  <p className="text-green-900 font-mono text-lg font-bold mt-1">{orderConfirmation.payment_reference}</p>
                  <p className="text-green-700 font-body text-xs mt-1">Use this reference when making your bank transfer.</p>
                </div>
              )}
              {orderConfirmation?.bank_details?.bsb && (
                <div className="bg-white border border-green-300 rounded-lg p-3">
                  <p className="text-green-900 font-body text-sm font-semibold">Bank Transfer Details:</p>
                  <div className="mt-1 text-sm font-body text-green-800 space-y-0.5">
                    <p>Account Name: <span className="font-semibold">{orderConfirmation.bank_details.account_name}</span></p>
                    <p>BSB: <span className="font-semibold">{orderConfirmation.bank_details.bsb}</span></p>
                    <p>Account Number: <span className="font-semibold">{orderConfirmation.bank_details.account_number}</span></p>
                  </div>
                </div>
              )}
              <p className="text-green-700 font-body text-sm">
                Thank you for your purchase. Your order will be available for collection at the club once payment is confirmed.
              </p>
            </div>
          )}

          {submitStatus === 'cancelled' && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg" role="alert">
              <p className="text-yellow-800 font-body font-semibold">Payment cancelled</p>
              <p className="text-yellow-700 font-body text-sm mt-1">
                Your payment was cancelled. Your order has not been placed. You can try again below.
              </p>
            </div>
          )}

          {submitStatus === 'error' && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
              <p className="text-red-800 font-body font-semibold">Failed to submit order</p>
              <p className="text-red-700 font-body text-sm mt-1">{errorMessage}</p>
            </div>
          )}

          {formErrors.cart && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg" role="alert">
              <p className="text-yellow-800 font-body text-sm">{formErrors.cart}</p>
            </div>
          )}

          {cart.length === 0 && submitStatus !== 'success' ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-gray-500 font-body">Your order is empty.</p>
                <p className="text-gray-400 font-body text-sm mt-1">
                  Add items from above to get started.
                </p>
              </CardContent>
            </Card>
          ) : cart.length > 0 ? (
            <>
              {/* Cart Items */}
              <Card className="mb-8">
                <div className="divide-y divide-gray-100">
                  {cart.map((item, idx) => (
                    <div key={`${item.id}-${item.size}-${item.custom_name || ''}-${idx}`} className="px-6 py-4 flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-body font-semibold text-gray-900">{item.name}</p>
                        <p className="font-body text-sm text-gray-500">
                          Size: {item.size} · {formatCurrency(item.price)} each
                        </p>
                        {item.custom_name && (
                          <p className="font-body text-xs text-maroon-700">Name: {item.custom_name}</p>
                        )}
                        {item.custom_number !== undefined && (
                          <p className="font-body text-xs text-maroon-700">Number: {item.custom_number}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-sm transition-colors"
                            onClick={() => updateCartQuantity(idx, -1)}
                            aria-label={`Decrease ${item.name} quantity`}
                          >
                            -
                          </button>
                          <span className="font-body font-semibold w-6 text-center text-sm">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-sm transition-colors"
                            onClick={() => updateCartQuantity(idx, 1)}
                            aria-label={`Increase ${item.name} quantity`}
                          >
                            +
                          </button>
                        </div>
                        <span className="font-body font-semibold text-gray-900 w-20 text-right">
                          {formatCurrency(item.price * item.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(idx)}
                          className="text-red-500 hover:text-red-700 transition-colors p-1"
                          aria-label={`Remove ${item.name} from order`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 bg-maroon-50 border-t border-maroon-100 flex items-center justify-between">
                  <span className="font-display font-bold text-maroon-800 text-lg">Total</span>
                  <span className="font-display font-bold text-maroon-800 text-xl">
                    {formatCurrency(cartTotal)}
                  </span>
                </div>
              </Card>

              {/* Customer Details Form */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-display font-bold text-gray-900 text-lg mb-4">
                    Your Details
                  </h3>
                  <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <input
                      type="text"
                      name="website"
                      value={formData.hp_field}
                      onChange={(e) => setFormData((prev) => ({ ...prev, hp_field: e.target.value }))}
                      className="hidden"
                      tabIndex={-1}
                      autoComplete="off"
                    />
                    <Input
                      id="merch_name"
                      label="Full Name"
                      type="text"
                      required
                      placeholder="e.g. Jane Smith"
                      value={formData.name}
                      error={formErrors.name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        id="merch_email"
                        label="Email Address"
                        type="email"
                        required
                        placeholder="e.g. jane@example.com"
                        value={formData.email}
                        error={formErrors.email}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, email: e.target.value }))
                        }
                      />

                      <Input
                        id="merch_phone"
                        label="Phone Number"
                        type="tel"
                        required
                        placeholder="e.g. 0412 345 678"
                        value={formData.phone}
                        error={formErrors.phone}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, phone: e.target.value }))
                        }
                      />
                    </div>

                    <Textarea
                      id="merch_notes"
                      label="Notes (optional)"
                      placeholder="Any special requests or notes..."
                      rows={3}
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, notes: e.target.value }))
                      }
                    />

                    <Button
                      type="submit"
                      isLoading={isSubmitting}
                      size="lg"
                      className="w-full"
                      disabled={!windowState.processing_open && !windowState.queue_allowed}
                    >
                      {isSubmitting
                        ? 'Submitting order...'
                        : !windowState.processing_open && !windowState.queue_allowed
                          ? 'Ordering Closed'
                          : !windowState.processing_open
                            ? 'Queue Order for Next Window'
                            : 'Place Order (Bank Transfer)'}
                    </Button>

                    <p className="text-gray-500 font-body text-xs text-center">
                      After submission you will receive a payment reference for bank transfer.
                    </p>
                    <p className="text-gray-500 font-body text-xs text-center">
                      Example reference format: NDCC-YYYYMMDD-1234
                    </p>
                  </form>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
