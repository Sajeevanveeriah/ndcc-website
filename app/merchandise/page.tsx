'use client';

import { Suspense, useState, useEffect, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertTriangle, XCircle, ExternalLink, ImageOff } from 'lucide-react';
import Card, { CardContent, CardFooter } from '@/components/ui/Card';
import SafeImage from '@/components/common/SafeImage';
import ScrollReveal from '@/components/common/ScrollReveal';
import Button from '@/components/ui/Button';
import Input, { Textarea } from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { CLUB_NAME } from '@/lib/constants';
import { formatCurrency, validateEmail, validatePhone, cn } from '@/lib/utils';
import { OrderItem } from '@/lib/types';
import { computeUnitPrice, type CatalogueOption } from '@/lib/apparel/pricing';
import { validatePersonalisation } from '@/lib/apparel/personalisation';
import SizingGuides from '@/components/merchandise/SizingGuides';

interface CartItem extends OrderItem {
  id: string;
  options?: Record<string, string>;
  option_labels?: string[];
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
  imageAlt: string;
  customisable?: boolean;
  category?: string;
  payment_mode?: string | null;
  payment_link_url?: string | null;
  options: CatalogueOption[];
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
  // Payment-readiness fields (may be absent until the migration is applied).
  payment_mode?: string | null;
  payment_link_url?: string | null;
  stripe_price_id?: string | null;
  checkout_enabled?: boolean | null;
  fulfilment_notes?: string | null;
  order_email?: string | null;
  image_alt?: string | null;
  options?: CatalogueOption[] | null;
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
    textColor: 'text-maroon-800 dark:text-maroon-200',
  },
  'playing-trousers': {
    path: 'M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
    textColor: 'text-maroon-800 dark:text-maroon-200',
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

type PaymentCapabilities = {
  bank_transfer: boolean;
  card: boolean;
  partial_payments: boolean;
  minimum_partial_amount: number;
};

// Until the server says otherwise, only bank transfer is offered. Card
// availability comes from /api/payments/capabilities (CMS switch + server
// environment) — never from a hardcoded client flag.
const DEFAULT_CAPABILITIES: PaymentCapabilities = {
  bank_transfer: true,
  card: false,
  partial_payments: false,
  minimum_partial_amount: 10,
};

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
  const [orderConfirmation, setOrderConfirmation] = useState<{
    order_id: string;
    total_amount: number;
    payment_reference: string;
    personalisation_requested: boolean;
    number_requested: boolean;
    bank_details: { account_name: string; bsb: string; account_number: string };
  } | null>(null);
  const [capabilities, setCapabilities] = useState<PaymentCapabilities>(DEFAULT_CAPABILITIES);
  const [cardAmount, setCardAmount] = useState('');
  const [cardPaying, setCardPaying] = useState(false);
  const [cardError, setCardError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // Start empty with a loading skeleton. There is deliberately NO static
  // fallback catalogue: when the live fetch fails the page shows an explicit
  // unavailable state with a retry control instead of stale products/prices.
  const [products, setProducts] = useState<DisplayProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
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

    setProductsLoading(true);

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
        setProducts((payload.data as ApiProduct[])
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
            payment_link_url: p.payment_link_url || null,
            options: Array.isArray(p.options) ? p.options : [],
          })));
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
        }
      } catch (err) {
        console.error('[merchandise] Failed to load payment capabilities; keeping bank-transfer-only defaults:', err);
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
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">{heroContent.title}</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">
            {heroContent.body}
          </p></ScrollReveal>
        </div>
      </section>

      {/* Products Grid */}
      <section className="section-padding surface-blue-band">
        <div className="container-width">
          <h2 className="section-title mb-2">Products</h2>
          {heroContent.orderBody && (
            <div className="mb-6 panel-blue-subtle p-4">
              <h3 className="font-display font-bold text-maroon-800 dark:text-maroon-200">{heroContent.orderTitle}</h3>
              <p className="mt-2 text-sm text-content-secondary whitespace-pre-line">{heroContent.orderBody}</p>
            </div>
          )}
          <SizingGuides />
          {liveProductsFailed && !productsLoading && (
            <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-4 flex flex-wrap items-center justify-between gap-3" role="alert">
              <p className="font-body text-sm text-amber-900 dark:text-amber-100">
                The live product catalogue is temporarily unavailable, so products and prices cannot be shown right now.
                Please try again in a moment.
              </p>
              <button
                type="button"
                onClick={() => setProductsReloadKey((key) => key + 1)}
                className="focus-ring inline-flex items-center rounded-lg border border-maroon-300 px-3 py-1.5 font-body text-sm font-semibold text-maroon-700 dark:text-maroon-200 transition-colors hover:bg-maroon-50 dark:hover:bg-maroon-900/40"
              >
                Try again
              </button>
            </div>
          )}
          {productsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i}>
                  <div className="h-36 bg-gray-200 animate-pulse" />
                  <CardContent className="space-y-3">
                    <div className="h-5 w-3/4 rounded bg-gray-200 animate-pulse" />
                    <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
                    <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
                    <div className="h-9 w-full rounded bg-gray-200 animate-pulse" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : products.length === 0 ? (
            liveProductsFailed ? null : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="font-body font-semibold text-content-secondary">No products currently available</p>
                <p className="font-body text-sm text-content-muted mt-1">
                  Check back soon — new club merchandise will appear here when it goes on sale.
                </p>
              </CardContent>
            </Card>
            )
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {!windowState.processing_open && (
              <div className="md:col-span-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 text-sm">
                Orders are currently outside the active merch window.
                {windowState.queue_allowed ? ' New orders will be queued for the next window.' : ' Ordering is temporarily unavailable.'}
              </div>
            )}
            {Object.entries(groupedProducts).map(([category, productsInCategory]) => (
              <div key={category} className="md:col-span-2 lg:col-span-3 xl:col-span-4">
                <h3 className="text-xl font-display font-bold text-maroon-800 dark:text-maroon-200 mb-3">{category}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {productsInCategory.map((product) => {
                  const gradient = PRODUCT_GRADIENTS[product.id] || 'from-maroon-600 to-maroon-800';
                  const iconData = PRODUCT_ICONS[product.id];
                  return (
                    <Card key={product.id} className="hover-lift">
                  {product.image ? (
                    <div className="relative h-36 bg-surface-page">
                      <SafeImage
                        src={product.image}
                        alt={product.imageAlt || product.name}
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 25vw"
                        fallback={<div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} aria-hidden="true" />}
                      />
                    </div>
                  ) : (
                    <div
                      className={`h-36 bg-gradient-to-br ${gradient} flex flex-col items-center justify-center gap-2 px-4 text-center`}
                      role="img"
                      aria-label={product.imageAlt || `Product image unavailable for ${product.name}`}
                    >
                      {iconData ? (
                        <svg className={`w-12 h-12 ${iconData.textColor}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d={iconData.path} />
                        </svg>
                      ) : (
                        <ImageOff className="h-8 w-8 text-white/80" aria-hidden="true" />
                      )}
                      <span className="text-xs font-body font-semibold text-white">Product image unavailable</span>
                    </div>
                  )}
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-bold text-content-primary text-sm leading-tight">
                        {product.name}
                      </h3>
                      <Badge variant="default" className="flex-shrink-0">{formatCurrency(displayUnitPrice(product))}</Badge>
                    </div>
                    <p className="font-body text-content-muted text-xs">{product.description}</p>

                    {product.customisable && (
                      <Badge variant="info" className="text-xs">Customisable</Badge>
                    )}

                    {/* Option selectors (colour, sleeve length, style, ...) */}
                    {Array.from(new Set(product.options.map((o) => o.option_group))).map((group) => {
                      const values = product.options
                        .filter((o) => o.option_group === group)
                        .sort((a, b) => a.display_order - b.display_order);
                      const current = selectedOptions[product.id]?.[group]
                        ?? values.find((v) => v.is_default)?.option_value
                        ?? values[0]?.option_value;
                      return (
                        <fieldset key={group}>
                          <legend className="form-label text-xs">{group}</legend>
                          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${product.name} ${group}`}>
                            {values.map((value) => (
                              <button
                                key={value.option_value}
                                type="button"
                                role="radio"
                                aria-checked={current === value.option_value}
                                className={cn(
                                  'focus-ring px-2.5 py-1 rounded-lg border text-xs font-body font-medium transition-colors',
                                  current === value.option_value
                                    ? 'border-maroon-700 bg-maroon-700 text-white'
                                    : 'border-edge-strong text-content-secondary hover:border-maroon-400'
                                )}
                                onClick={() =>
                                  setSelectedOptions((prev) => ({
                                    ...prev,
                                    [product.id]: { ...(prev[product.id] || {}), [group]: value.option_value },
                                  }))
                                }
                              >
                                {value.option_label}
                                {Number(value.price_delta) > 0 && (
                                  <span className="ml-1 opacity-80">+{formatCurrency(Number(value.price_delta))}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </fieldset>
                      );
                    })}

                    {/* Size Selector */}
                    <div>
                      <p className="form-label text-xs">Size</p>
                      {product.sizes.length === 0 ? (
                        <p className="text-xs text-content-muted">No size selection required.</p>
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
                                  : 'border-edge-strong text-content-secondary hover:border-maroon-400'
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

                    {/* Surname and number preferences for customisable products */}
                    {product.customisable && (
                      <div className="space-y-2">
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                          Surname only. Nicknames will not be accepted. Both number preferences are requests and remain subject to availability and club confirmation.
                        </p>
                        <div>
                          <label htmlFor={`custom-name-${product.id}`} className="form-label text-xs">Surname (optional)</label>
                          <input
                            id={`custom-name-${product.id}`}
                            type="text"
                            className="w-full px-3 py-1.5 border border-edge-strong rounded-lg text-sm font-body focus:border-maroon-500 focus:ring-1 focus:ring-maroon-500 outline-none"
                            placeholder="e.g. SMITH"
                            maxLength={40}
                            value={customNames[product.id] || ''}
                            onChange={(e) => {
                              setCustomNames((prev) => ({ ...prev, [product.id]: e.target.value }));
                              setPersonalisationErrors((prev) => ({ ...prev, [product.id]: '' }));
                            }}
                          />
                        </div>
                        <div>
                          <label htmlFor={`custom-number-${product.id}`} className="form-label text-xs">First number preference (optional)</label>
                          <input
                            id={`custom-number-${product.id}`}
                            type="number"
                            min={1}
                            max={99}
                            className="w-full px-3 py-1.5 border border-edge-strong rounded-lg text-sm font-body focus:border-maroon-500 focus:ring-1 focus:ring-maroon-500 outline-none"
                            placeholder="1-99"
                            value={customNumbers[product.id] || ''}
                            onChange={(e) => {
                              setCustomNumbers((prev) => ({ ...prev, [product.id]: e.target.value }));
                              setPersonalisationErrors((prev) => ({ ...prev, [product.id]: '' }));
                            }}
                          />
                        </div>
                        <div>
                          <label htmlFor={`alternate-number-${product.id}`} className="form-label text-xs">Second number preference (optional)</label>
                          <input
                            id={`alternate-number-${product.id}`}
                            type="number"
                            min={1}
                            max={99}
                            className="w-full px-3 py-1.5 border border-edge-strong rounded-lg text-sm font-body focus:border-maroon-500 focus:ring-1 focus:ring-maroon-500 outline-none"
                            placeholder="1-99"
                            value={alternateNumbers[product.id] || ''}
                            onChange={(e) => {
                              setAlternateNumbers((prev) => ({ ...prev, [product.id]: e.target.value }));
                              setPersonalisationErrors((prev) => ({ ...prev, [product.id]: '' }));
                            }}
                          />
                        </div>
                        <label className="flex items-start gap-2 text-xs text-content-secondary">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={personalisationConfirmed[product.id] || false}
                            onChange={(e) => {
                              setPersonalisationConfirmed((prev) => ({ ...prev, [product.id]: e.target.checked }));
                              setPersonalisationErrors((prev) => ({ ...prev, [product.id]: '' }));
                            }}
                          />
                          <span>I confirm any name entered is a surname and understand that both number preferences are subject to availability and club confirmation.</span>
                        </label>
                        {personalisationErrors[product.id] && (
                          <p className="text-xs text-red-600" role="alert">{personalisationErrors[product.id]}</p>
                        )}
                      </div>
                    )}

                    {/* Quantity Selector */}
                    <div>
                      <p className="form-label text-xs">Quantity</p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="h-11 w-11 rounded-lg border border-edge-strong flex items-center justify-center text-content-secondary hover:bg-surface-muted transition-colors text-base focus-ring"
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
                        <span className="font-body font-semibold text-content-primary w-6 text-center text-sm">
                          {quantities[product.id] || 1}
                        </span>
                        <button
                          type="button"
                          className="h-11 w-11 rounded-lg border border-edge-strong flex items-center justify-center text-content-secondary hover:bg-surface-muted transition-colors text-base focus-ring"
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
                  <CardFooter className="space-y-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleAddToOrder(product.id)}
                      className="w-full"
                    >
                      Add to Order
                    </Button>
                    {product.payment_mode === 'stripe_payment_link' && product.payment_link_url && (
                      <a
                        href={product.payment_link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="focus-ring inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-maroon-300 px-3 py-2 font-body text-sm font-semibold text-maroon-700 dark:text-maroon-200 transition-colors hover:bg-maroon-50"
                        aria-label={`Pay online for ${product.name} (opens in a new tab)`}
                      >
                        Pay online
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </CardFooter>
                    </Card>
                  );
                })}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </section>

      {/* Order Summary & Form */}
      <section className="section-padding bg-surface-page" aria-label="Order summary and checkout">
        <div className="container-width max-w-3xl mx-auto">
          <h2 className="section-title">Your Order</h2>

          {submitStatus === 'success' && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg space-y-3" role="alert">
              <p className="text-green-800 font-body font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                {orderConfirmation ? 'Order confirmed!' : 'Online payment submitted'}
              </p>
              {orderConfirmation?.payment_reference && (
                <div className="bg-surface-card border border-green-300 rounded-lg p-3">
                  <p className="text-green-900 font-body text-sm font-semibold">Your Payment Reference:</p>
                  <p className="text-green-900 font-mono text-lg font-bold mt-1">{orderConfirmation.payment_reference}</p>
                  <p className="text-green-700 font-body text-xs mt-1">Use this reference when making your bank transfer.</p>
                </div>
              )}
              {orderConfirmation?.bank_details?.bsb && (
                <div className="bg-surface-card border border-green-300 rounded-lg p-3">
                  <p className="text-green-900 font-body text-sm font-semibold">Bank Transfer Details:</p>
                  <div className="mt-1 text-sm font-body text-green-800 space-y-0.5">
                    <p>Account Name: <span className="font-semibold">{orderConfirmation.bank_details.account_name}</span></p>
                    <p>BSB: <span className="font-semibold">{orderConfirmation.bank_details.bsb}</span></p>
                    <p>Account Number: <span className="font-semibold">{orderConfirmation.bank_details.account_number}</span></p>
                  </div>
                </div>
              )}
              {orderConfirmation?.personalisation_requested && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  {orderConfirmation.number_requested
                    ? 'Your surname and number preferences have been recorded for club review. The club will confirm the final number by email, subject to availability.'
                    : 'Your surname has been recorded for club review.'}
                </div>
              )}
              {capabilities.card && orderConfirmation?.order_id && (
                <div className="bg-surface-card border border-green-300 rounded-lg p-3 space-y-2">
                  <p className="text-green-900 font-body text-sm font-semibold">Prefer to pay online?</p>
                  <p className="text-green-800 font-body text-xs">
                    Continue to Stripe Checkout instead of using bank transfer. Total: {formatCurrency(orderConfirmation.total_amount)}.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <Button
                      type="button"
                      size="sm"
                      isLoading={cardPaying}
                      onClick={() => startCardPayment(null)}
                    >
                      Pay full amount online
                    </Button>
                    {capabilities.partial_payments && (
                      <div className="flex items-end gap-2">
                        <div>
                          <label htmlFor="card-part-amount" className="form-label text-xs">
                            Part payment (min {formatCurrency(capabilities.minimum_partial_amount)})
                          </label>
                          <input
                            id="card-part-amount"
                            type="number"
                            inputMode="decimal"
                            min={capabilities.minimum_partial_amount}
                            max={orderConfirmation.total_amount}
                            step="0.01"
                            className="w-32 px-3 py-2 border border-edge-strong rounded-lg text-sm font-body focus:border-maroon-500 focus:ring-1 focus:ring-maroon-500 outline-none"
                            value={cardAmount}
                            onChange={(e) => setCardAmount(e.target.value)}
                            aria-describedby={cardError ? 'card-pay-error' : undefined}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          isLoading={cardPaying}
                          onClick={() => {
                            const amount = Number(cardAmount);
                            if (!Number.isFinite(amount) || amount <= 0) {
                              setCardError('Enter a valid part-payment amount.');
                              return;
                            }
                            startCardPayment(amount);
                          }}
                        >
                          Pay part online
                        </Button>
                      </div>
                    )}
                  </div>
                  {cardError && (
                    <p id="card-pay-error" className="text-red-700 font-body text-xs" role="alert">{cardError}</p>
                  )}
                </div>
              )}
              <p className="text-green-700 font-body text-sm">
                {orderConfirmation
                  ? 'Thank you for your order. It will be available for collection at the club once payment is confirmed.'
                  : 'Stripe has returned you to the club website. Your signed payment notification is being matched to the order before collection is approved.'}
              </p>
            </div>
          )}

          {submitStatus === 'cancelled' && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3" role="alert">
              <AlertTriangle className="h-5 w-5 text-yellow-800 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-yellow-800 font-body font-semibold">Online payment cancelled</p>
                <p className="text-yellow-700 font-body text-sm mt-1">
                  Your order is still placed, but no card payment was completed. Use the payment reference from your
                  confirmation email for bank transfer, or contact the club if you want another online payment link.
                </p>
              </div>
            </div>
          )}

          {submitStatus === 'error' && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3" role="alert">
              <XCircle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-red-800 font-body font-semibold">Failed to submit order</p>
                <p className="text-red-700 font-body text-sm mt-1">{errorMessage}</p>
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
              <Card className="mb-8">
                <div className="divide-y divide-edge-subtle">
                  {cart.map((item, idx) => (
                    <div key={`${item.id}-${item.size}-${item.custom_name || ''}-${idx}`} className="px-6 py-4 flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-body font-semibold text-content-primary">{item.name}</p>
                        <p className="font-body text-sm text-content-muted">
                          Size: {item.size} · {formatCurrency(item.price)} each
                        </p>
                        {item.option_labels?.map((label) => (
                          <p key={label} className="font-body text-xs text-content-muted">{label}</p>
                        ))}
                        {item.custom_name && (
                          <p className="font-body text-xs text-maroon-700 dark:text-maroon-200">Surname: {item.custom_name}</p>
                        )}
                        {item.custom_number !== undefined && (
                          <p className="font-body text-xs text-maroon-700 dark:text-maroon-200">
                            Number preferences: {item.custom_number}{item.alternate_number !== undefined ? `, ${item.alternate_number}` : ''} (subject to availability)
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="w-7 h-7 rounded border border-edge-strong flex items-center justify-center text-content-muted hover:bg-surface-muted text-sm transition-colors"
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
                            className="w-7 h-7 rounded border border-edge-strong flex items-center justify-center text-content-muted hover:bg-surface-muted text-sm transition-colors"
                            onClick={() => updateCartQuantity(idx, 1)}
                            aria-label={`Increase ${item.name} quantity`}
                          >
                            +
                          </button>
                        </div>
                        <span className="font-body font-semibold text-content-primary w-20 text-right">
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
                <div className="px-6 py-4 bg-maroon-50 dark:bg-maroon-950 border-t border-maroon-100 flex items-center justify-between">
                  <span className="font-display font-bold text-maroon-800 dark:text-maroon-200 text-lg">Total</span>
                  <span className="font-display font-bold text-maroon-800 dark:text-maroon-200 text-xl">
                    {formatCurrency(cartTotal)}
                  </span>
                </div>
              </Card>

              {/* Customer Details Form */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-display font-bold text-content-primary text-lg mb-4">
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
                            : capabilities.card
                              ? 'Place Order'
                              : 'Place Order (Bank Transfer)'}
                    </Button>

                    <p className="text-content-muted font-body text-xs text-center">
                      {capabilities.card
                        ? 'After submission you will receive a bank-transfer reference, or you can continue to Stripe Checkout.'
                        : 'After submission you will receive a payment reference for bank transfer.'}
                    </p>
                    <p className="text-content-muted font-body text-xs text-center">
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
