CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  customer_phone TEXT DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status TEXT DEFAULT 'pending',
  stripe_session_id TEXT,
  processed BOOLEAN DEFAULT FALSE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  order_status TEXT DEFAULT 'submitted',
  payment_reference TEXT,
  bank_reference_used TEXT,
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  needs_review_reason TEXT DEFAULT '',
  order_category TEXT DEFAULT 'general',
  merch_window_id UUID,
  merch_window_label TEXT
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email TEXT NOT NULL DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_status TEXT DEFAULT 'submitted';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bank_reference_used TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmed_by UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS needs_review_reason TEXT DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_category TEXT DEFAULT 'general';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS merch_window_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS merch_window_label TEXT;

CREATE TABLE IF NOT EXISTS apparel_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  sizes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  image_url TEXT NOT NULL DEFAULT '',
  customisable BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merch_order_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  open_date TIMESTAMPTZ NOT NULL,
  close_date TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  allow_queue_after_close BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (close_date > open_date)
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_category TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS order_status TEXT NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS merch_window_id UUID REFERENCES merch_order_windows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merch_window_label TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'pending';

INSERT INTO apparel_products (slug, name, description, price, sizes, image_url, customisable, active)
VALUES
  ('playing-shirt', 'Playing Shirt', 'Official NDCC playing shirt.', 60, ARRAY['XS','S','M','L','XL','2XL','3XL'], '', TRUE, TRUE),
  ('club-hoodie', 'Club Hoodie', 'Maroon club hoodie.', 65, ARRAY['XS','S','M','L','XL','2XL','3XL'], '', FALSE, TRUE),
  ('club-cap', 'Club Cap', 'Adjustable maroon cap.', 30, ARRAY['One Size'], '', FALSE, TRUE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO merch_order_windows (label, open_date, close_date, active, allow_queue_after_close)
SELECT
  'Season Launch Window',
  NOW() - INTERVAL '7 days',
  NOW() + INTERVAL '14 days',
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM merch_order_windows);
