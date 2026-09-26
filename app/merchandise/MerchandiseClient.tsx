'use client';

import { Suspense, useState, useEffect, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, XCircle } from 'lucide-react';
import Card, { CardContent } from '@/components/ui/Card';
import ScrollReveal from '@/components/common/ScrollReveal';
import { CLUB_NAME } from '@/lib/constants';
import { validateEmail, validatePhone } from '@/lib/utils';
import { computeUnitPrice } from '@/lib/apparel/pricing';
import { validatePersonalisation } from '@/lib/apparel/personalisation';
import CartSummary from './components/CartSummary';
import CheckoutForm from './components/CheckoutForm';
import OrderConfirmationPanel from './components/OrderConfirmationPanel';
import ProductCatalogue from './components/ProductCatalogue';
import type {
  ApiProduct,
  CartItem,
  DisplayProduct,
  MerchandiseWindow,
  OrderConfirmation,
  PaymentCapabilities,
  ProductSelectionState,
} from './components/types';

export type { ApiProduct } from './components/types';


// Until the server says otherwise, only bank transfer is offered. Card
// availability comes from /api/payments/capabilities (CMS switch + server
// environment) — never from a hardcoded client flag.
const DEFAULT_CAPABILITIES: PaymentCapabilities = {
  bank_transfer: false,
  card: false,
  partial_payments: false,
  minimum_partial_amount: 10,
};

function toDisplayProducts(data: ApiProduct[]): DisplayProduct[] {
  return [...data]
          .sort((a, b) => (a.display_order ?? 9999) - (b.display_order ?? 9999))
          .map((p) => ({
            id: p.slug,
            name: p.name,
            price: Number(p.price || 0),
            description: [p.description, p.order_guidance, p.size_guidance].filter(Boolean).join('\n\n'),
            sizes: Array.isArray(p.sizes) ? p.sizes : [],
            image: p.image_url || '',
            imageAlt: p.image_alt || p.name,
            customisable: Boolean(p.customisable),
            category: p.category || 'General',
            payment_mode: p.payment_mode || null,
            options: Array.isArray(p.options) ? p.options : [],
          }));
}

export default function MerchandisePage({ initialProducts }: { initialProducts: ApiProduct[] }) {
  return (
    <Suspense>
      <MerchandiseContent initialProducts={initialProducts} />
    </Suspense>
  );
}

function MerchandiseContent({ initialProducts }: { initialProducts: ApiProduct[] }) {
  const searchParams = useSearchParams();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, Record<string, string>>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [sizeErrors, setSizeErrors] = useState<Record<string, string>>({});
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [customNumbers, setCustomNumbers] = useState<Record<string, string>>({});
  const [alternateNumbers, setAlternateNumbers] = useState<Record<string, string>>({});
  const [personalisationConfirmed, setPersonalisationConfirmed] = useState<Record<string, boolean>>({});
  const [personalisationErrors, setPersonalisationErrors] = useState<Record<string, string>>({});

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
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [capabilities, setCapabilities] = useState<PaymentCapabilities>(DEFAULT_CAPABILITIES);
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'stripe'>('bank_transfer');
  const [cardAmount, setCardAmount] = useState('');
  const [cardPaying, setCardPaying] = useState(false);
  const [cardError, setCardError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // Start with a live server read, then refresh in the browser. Never use seed products.
  const [products, setProducts] = useState<DisplayProduct[]>(() => toDisplayProducts(initialProducts));
  const [productsLoading, setProductsLoading] = useState(false);
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
  // True when the live products fetch failed; renders the catalogue
  // unavailable banner with its retry control.
  const [liveProductsFailed, setLiveProductsFailed] = useState(false);
  const [productsReloadKey, setProductsReloadKey] = useState(0);

  useEffect(() => {
    document.title = 'Club Merchandise | NDCC Dinos';

    if (searchParams.get('payment') === 'submitted' || searchParams.get('success') === 'true') {
      setSubmitStatus('success');
    } else if (searchParams.get('payment') === 'cancelled' || searchParams.get('cancelled') === 'true') {
      setSubmitStatus('cancelled');
    }
  }, [searchParams]);

  useEffect(() => {
    // Set on cleanup so a slow response from a superseded run (an earlier
    // mount or an older Try again click) can't clobber newer state.
    let stale = false;

    if (productsReloadKey > 0) setProductsLoading(true);

    // Each loader catches and logs its own failure so one unreachable
    // endpoint can't silently discard what the other two returned.
    const loadProducts = async () => {
      try {
        const res = await fetch('/api/apparel/products', { cache: 'no-store' });
        const payload = await res.json();
        if (!res.ok || !Array.isArray(payload?.data)) {
          throw new Error(`Products request failed with status ${res.status}`);
        }
        if (stale) return;
        // A successful response is authoritative, including an empty
        // catalogue: render the clean empty state, not the static seed list.
        setProducts(toDisplayProducts(payload.data as ApiProduct[]));
        setLiveProductsFailed(false);
      } catch (err) {
        // A live catalogue failure must never silently show stale products
        // or prices: clear the grid and surface the unavailable state with
        // its retry control instead.
        console.error('[merchandise] Failed to load live products; showing unavailable state:', err);
        if (!stale) {
          setProducts([]);
          setLiveProductsFailed(true);
        }
      } finally {
        if (!stale) setProductsLoading(false);
      }
    };

    const loadWindows = async () => {
      try {
        const res = await fetch('/api/apparel/windows', { cache: 'no-store' });
        const payload = await res.json();
        if (!stale && res.ok && payload?.data) {
          setWindowState(payload.data);
        }
      } catch (err) {
        console.error('[merchandise] Failed to load order windows; keeping open defaults:', err);
      }
    };

    const loadContentBlocks = async () => {
      try {
        const res = await fetch('/api/public/content-blocks?key=merch.hero&key=merch.ordering', { cache: 'no-store' });
        const payload = await res.json();
        if (stale) return;
        const blocks = payload?.data || {};
        const orderingBody = blocks['merch.ordering']?.body || '';
        setHeroContent({
          title: blocks['merch.hero']?.title || 'Club Merchandise',
          body: blocks['merch.hero']?.body || `Show your Dinos pride with official ${CLUB_NAME} gear. All merchandise is available for order online and collection from the club.`,
          orderTitle: blocks['merch.ordering']?.title || 'Ordering Information',
          orderBody: orderingBody.startsWith('Use this section to provide') ? '' : orderingBody,
        });
      } catch (err) {
        console.error('[merchandise] Failed to load content blocks; keeping default copy:', err);
      }
    };

    const loadCapabilities = async () => {
      try {
        const res = await fetch('/api/payments/capabilities', { cache: 'no-store' });
        const payload = await res.json();
        if (!stale && res.ok && payload?.data) {
          setCapabilities({ ...DEFAULT_CAPABILITIES, ...payload.data });
          if (!payload.data.bank_transfer && payload.data.card) setPaymentMethod('stripe');
        }
      } catch (err) {
        console.error('[merchandise] Failed to load payment capabilities; keeping payment methods unavailable:', err);
      }
    };

    void Promise.all([loadProducts(), loadWindows(), loadContentBlocks(), loadCapabilities()]);
    return () => {
      stale = true;
    };
  }, [productsReloadKey]);

  async function startCardPayment(amount: number | null) {
    if (!orderConfirmation) return;
    setCardPaying(true);
    setCardError('');
    try {
      const response = await fetch('/api/payments/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderConfirmation.order_id,
          ...(amount !== null ? { amount } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.checkout_url) {
        throw new Error(data?.error || 'Card payment could not be started.');
      }
      window.location.href = data.checkout_url;
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Card payment could not be started.');
      setCardPaying(false);
    }
  }

  // Display price for the currently-selected options; falls back to the base
  // price if the option data is somehow inconsistent. The server recomputes
  // this independently — the client value is presentation only.
  function displayUnitPrice(product: DisplayProduct): number {
    const result = computeUnitPrice(
      { slug: product.id, name: product.name, price: product.price, options: product.options },
      selectedOptions[product.id]
    );
    return result.ok ? result.unitPrice : product.price;
  }

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
    const personalisation = validatePersonalisation(
      product.customisable
        ? {
          custom_name: customNames[productId],
          custom_number: customNumbers[productId],
          alternate_number: alternateNumbers[productId],
          personalisation_confirmed: personalisationConfirmed[productId],
        }
        : {}
    );
    if (!personalisation.ok) {
      setPersonalisationErrors((prev) => ({ ...prev, [productId]: personalisation.error }));
      return;
    }
    setPersonalisationErrors((prev) => ({ ...prev, [productId]: '' }));
    const {
      custom_name,
      custom_number,
      alternate_number,
      number_request_status,
      personalisation_confirmed,
    } = personalisation.value;

    const priced = computeUnitPrice(
      { slug: product.id, name: product.name, price: product.price, options: product.options },
      selectedOptions[product.id]
    );
    const unitPrice = priced.ok ? priced.unitPrice : product.price;
    const appliedOptions: Record<string, string> = {};
    const optionLabels: string[] = [];
    if (priced.ok) {
      for (const applied of priced.applied) {
        appliedOptions[applied.group] = applied.value;
        optionLabels.push(`${applied.group}: ${applied.label}`);
      }
    }
    const optionsKey = JSON.stringify(appliedOptions);

    const existingIdx = cart.findIndex(
      (item) => item.id === productId && item.size === size && item.custom_name === custom_name
        && item.custom_number === custom_number && item.alternate_number === alternate_number
        && JSON.stringify(item.options || {}) === optionsKey
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
          price: unitPrice,
          options: Object.keys(appliedOptions).length > 0 ? appliedOptions : undefined,
          option_labels: optionLabels.length > 0 ? optionLabels : undefined,
          custom_name,
          custom_number,
          alternate_number,
          number_request_status,
          personalisation_confirmed,
        },
      ]);
    }

    setQuantities((prev) => ({ ...prev, [productId]: 1 }));
    if (product.customisable) {
      setCustomNames((prev) => ({ ...prev, [productId]: '' }));
      setCustomNumbers((prev) => ({ ...prev, [productId]: '' }));
      setAlternateNumbers((prev) => ({ ...prev, [productId]: '' }));
      setPersonalisationConfirmed((prev) => ({ ...prev, [productId]: false }));
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
      // Orders are always created through /api/orders so every order gets a
      // bank-transfer payment reference; paying by card is an optional next
      // step from the confirmation panel (server-validated, webhook-settled).
      const endpoint = '/api/orders';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: formData.name,
          customer_email: formData.email,
          customer_phone: formData.phone,
          notes: formData.notes,
          items: cart.map(({
            id, name, size, quantity, price, options, custom_name, custom_number,
            alternate_number, number_request_status, personalisation_confirmed,
          }) => ({
            slug: id,
            name,
            size,
            quantity,
            price,
            ...(options ? { options } : {}),
            ...(custom_name ? { custom_name } : {}),
            ...(custom_number !== undefined ? { custom_number } : {}),
            ...(alternate_number !== undefined ? { alternate_number } : {}),
            ...(number_request_status ? { number_request_status } : {}),
            ...(personalisation_confirmed ? { personalisation_confirmed } : {}),
          })),
          total_amount: cartTotal,
          order_category: 'merch',
          payment_method: paymentMethod,
          merch_window_id: windowState.current_window?.id ?? windowState.next_window?.id ?? null,
          hp_field: formData.hp_field,
          submitted_at: formData.submitted_at,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      setOrderConfirmation({
        order_id: data.order_id || '',
        total_amount: Number(data.total_amount || 0),
        payment_reference: data.payment_reference || '',
        personalisation_requested: Boolean(data.personalisation_requested),
        number_requested: Boolean(data.number_requested),
        customer_email: formData.email,
        bank_details: data.bank_details || { account_name: '', bsb: '', account_number: '' },
      });
      setSubmitStatus('success');
      setCart([]);
      setFormData({ name: '', email: '', phone: '', notes: '', hp_field: '', submitted_at: Date.now() });
      setFormErrors({});
      if (paymentMethod === 'stripe' && data.order_id) {
        const checkoutResponse = await fetch('/api/payments/checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: data.order_id, return_path: '/merchandise' }),
        });
        const checkout = await checkoutResponse.json();
        if (!checkoutResponse.ok || !checkout.checkout_url) {
          setCardError(checkout?.error || 'Card payment could not be started. Your order remains recorded.');
          return;
        }
        window.location.href = checkout.checkout_url;
        return;
      }
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const selection: ProductSelectionState = {
    selectedOptions, setSelectedOptions, selectedSizes, setSelectedSizes, sizeErrors, setSizeErrors,
    quantities, setQuantities, customNames, setCustomNames, customNumbers, setCustomNumbers,
    alternateNumbers, setAlternateNumbers, personalisationConfirmed, setPersonalisationConfirmed,
    personalisationErrors, setPersonalisationErrors,
  };

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">{heroContent.title}</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">
            {heroContent.body}
          </p></ScrollReveal>
        </div>
      </section>

      <ProductCatalogue
        heroContent={heroContent}
        liveProductsFailed={liveProductsFailed}
        productsLoading={productsLoading}
        setProductsReloadKey={setProductsReloadKey}
        products={products}
        groupedProducts={groupedProducts}
        windowState={windowState}
        selection={selection}
        displayUnitPrice={displayUnitPrice}
        handleAddToOrder={handleAddToOrder}
      />

      {cart.length > 0 && <a href="#order-summary" className="club-basket-link">Review order <span>{cart.reduce((sum, item) => sum + item.quantity, 0)} {cart.reduce((sum, item) => sum + item.quantity, 0) === 1 ? 'item' : 'items'}</span></a>}
      {/* Order Summary & Form */}
      <section id="order-summary" className="section-padding bg-surface-page scroll-mt-32" aria-label="Order summary and checkout">
        <div className="container-width max-w-3xl mx-auto">
          <h2 className="section-title">Your Order</h2>

          {submitStatus === 'success' && (
            <OrderConfirmationPanel
              orderConfirmation={orderConfirmation}
              capabilities={capabilities}
              cardPaying={cardPaying}
              cardAmount={cardAmount}
              setCardAmount={setCardAmount}
              cardError={cardError}
              setCardError={setCardError}
              startCardPayment={startCardPayment}
            />
          )}

          {submitStatus === 'cancelled' && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3" role="alert">
              <AlertTriangle className="h-5 w-5 text-yellow-800 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-yellow-800 font-body font-semibold">Online payment cancelled</p>
                <p className="text-yellow-700 font-body text-sm mt-1">
                  Your order is still placed, but no card payment was completed. Use the payment reference from your
                  order summary for bank transfer, or contact the club if you need another payment method.
                </p>
              </div>
            </div>
          )}

          {submitStatus === 'error' && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3" role="alert">
              <XCircle className="h-5 w-5 text-red-700 dark:text-red-300 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-red-800 dark:text-red-200 font-body font-semibold">Failed to submit order</p>
                <p className="text-red-700 dark:text-red-300 font-body text-sm mt-1">{errorMessage}</p>
              </div>
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
                <p className="text-content-muted font-body">Your order is empty.</p>
                <p className="text-gray-400 font-body text-sm mt-1">
                  Add items from above to get started.
                </p>
              </CardContent>
            </Card>
          ) : cart.length > 0 ? (
            <>
              {/* Cart Items */}
              <CartSummary
                cart={cart}
                cartTotal={cartTotal}
                updateCartQuantity={updateCartQuantity}
                handleRemoveFromCart={handleRemoveFromCart}
              />

              {/* Customer Details Form */}
              <CheckoutForm
                formData={formData}
                setFormData={setFormData}
                formErrors={formErrors}
                handleSubmit={handleSubmit}
                capabilities={capabilities}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                isSubmitting={isSubmitting}
                windowState={windowState}
              />
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
