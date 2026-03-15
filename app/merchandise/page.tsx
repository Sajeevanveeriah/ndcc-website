'use client';

import { Suspense, useState, useEffect, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Card, { CardContent, CardFooter } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input, { Textarea } from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { PRODUCTS, CLUB_NAME, CLUB_EMAIL_USER, CLUB_EMAIL_DOMAIN } from '@/lib/constants';
import { formatCurrency, validateEmail, cn, assembleEmail } from '@/lib/utils';
import { OrderItem } from '@/lib/types';

interface CartItem extends OrderItem {
  id: string;
}

const PRODUCT_GRADIENTS: Record<string, string> = {
  'club-polo': 'from-maroon-600 to-maroon-800',
  'club-cap': 'from-maroon-700 to-maroon-950',
  'training-singlet': 'from-maroon-500 to-maroon-700',
};

function isStripeConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
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

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'cancelled' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const stripeEnabled = isStripeConfigured();

  useEffect(() => {
    document.title = 'Club Merchandise | NDCC Dinos';

    if (searchParams.get('success') === 'true') {
      setSubmitStatus('success');
    } else if (searchParams.get('cancelled') === 'true') {
      setSubmitStatus('cancelled');
    }
  }, [searchParams]);

  function handleAddToOrder(productId: string) {
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) return;

    const size = selectedSizes[productId];
    if (!size) {
      setSizeErrors((prev) => ({ ...prev, [productId]: 'Please select a size' }));
      return;
    }
    setSizeErrors((prev) => ({ ...prev, [productId]: '' }));

    const qty = quantities[productId] || 1;
    const existingIdx = cart.findIndex(
      (item) => item.id === productId && item.size === size
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
        },
      ]);
    }

    setQuantities((prev) => ({ ...prev, [productId]: 1 }));
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

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    if (!formData.phone.trim()) errors.phone = 'Phone number is required';
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
          items: cart.map(({ name, size, quantity, price }) => ({
            name,
            size,
            quantity,
            price,
          })),
          total_amount: cartTotal,
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

      // Non-Stripe fallback
      setSubmitStatus('success');
      setCart([]);
      setFormData({ name: '', email: '', phone: '', notes: '' });
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
          <h1 className="page-hero-title">Club Merchandise</h1>
          <p className="page-hero-subtitle">
            Show your Dinos pride with official {CLUB_NAME} gear. All merchandise is available for
            order online and collection from the club.
          </p>
        </div>
      </section>

      {/* Products Grid */}
      <section className="section-padding">
        <div className="container-width">
          <h2 className="section-title mb-8">Products</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {PRODUCTS.map((product) => (
              <Card key={product.id}>
                <div
                  className={`h-48 bg-gradient-to-br ${PRODUCT_GRADIENTS[product.id] || 'from-maroon-600 to-maroon-800'} flex items-center justify-center`}
                  aria-hidden="true"
                >
                  <span className="text-white font-display font-bold text-2xl opacity-70">
                    {product.name}
                  </span>
                </div>
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between">
                    <h3 className="font-display font-bold text-gray-900 text-lg">
                      {product.name}
                    </h3>
                    <Badge variant="default">{formatCurrency(product.price)}</Badge>
                  </div>
                  <p className="font-body text-gray-600 text-sm">{product.description}</p>

                  {/* Size Selector */}
                  <div>
                    <p className="form-label">Size</p>
                    <div className="flex flex-wrap gap-2">
                      {product.sizes.map((size) => (
                        <button
                          key={size}
                          type="button"
                          className={cn(
                            'px-3 py-1.5 rounded-lg border text-sm font-body font-medium transition-colors',
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
                    {sizeErrors[product.id] && (
                      <p className="mt-1 text-sm text-red-600">{sizeErrors[product.id]}</p>
                    )}
                  </div>

                  {/* Quantity Selector */}
                  <div>
                    <p className="form-label">Quantity</p>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-colors"
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
                      <span className="font-body font-semibold text-gray-900 w-8 text-center">
                        {quantities[product.id] || 1}
                      </span>
                      <button
                        type="button"
                        className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-colors"
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
            ))}
          </div>
        </div>
      </section>

      {/* Order Summary & Form */}
      <section className="section-padding bg-gray-50" aria-label="Order summary and checkout">
        <div className="container-width max-w-3xl mx-auto">
          <h2 className="section-title">Your Order</h2>

          {submitStatus === 'success' && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg" role="alert">
              <p className="text-green-800 font-body font-semibold">Order confirmed!</p>
              <p className="text-green-700 font-body text-sm mt-1">
                Thank you for your purchase. You will receive a confirmation email shortly.
                Your order will be available for collection at the club.
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
                    <div key={`${item.id}-${item.size}-${idx}`} className="px-6 py-4 flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-body font-semibold text-gray-900">{item.name}</p>
                        <p className="font-body text-sm text-gray-500">
                          Size: {item.size} · {formatCurrency(item.price)} each
                        </p>
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

                    {stripeEnabled ? (
                      <Button
                        type="submit"
                        isLoading={isSubmitting}
                        size="lg"
                        className="w-full"
                      >
                        {isSubmitting ? 'Redirecting to payment...' : 'Proceed to Payment'}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="lg"
                        className="w-full opacity-60 cursor-not-allowed"
                        disabled
                      >
                        Online payments coming soon
                      </Button>
                    )}

                    {!stripeEnabled && (
                      <p className="text-gray-400 font-body text-xs text-center">
                        Contact the club at {assembleEmail(CLUB_EMAIL_USER, CLUB_EMAIL_DOMAIN)} to order.
                      </p>
                    )}
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
