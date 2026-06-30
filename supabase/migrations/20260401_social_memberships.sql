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

CREATE TABLE IF NOT EXISTS social_membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_membership_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  usage_limit INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  membership_plan_id UUID REFERENCES social_membership_plans(id),
  order_id UUID,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_addon_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_application_id UUID NOT NULL REFERENCES member_applications(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES social_membership_addons(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_applications_email ON member_applications(email);
CREATE INDEX IF NOT EXISTS idx_member_applications_order_id ON member_applications(order_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'member_applications_order_id_fkey'
      AND conrelid = 'public.member_applications'::regclass
  ) THEN
    ALTER TABLE public.member_applications
      ADD CONSTRAINT member_applications_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_member_addon_member_application_id ON member_addon_selections(member_application_id);

INSERT INTO social_membership_plans (name, description, price, is_active, sort_order)
SELECT 'Social Membership', 'Annual social membership', 50, TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM social_membership_plans);

INSERT INTO social_membership_addons (name, description, price, usage_limit, is_active, sort_order)
SELECT 'Club T-Shirt', 'Optional club t-shirt add-on', 35, NULL, TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM social_membership_addons WHERE name = 'Club T-Shirt');

INSERT INTO social_membership_addons (name, description, price, usage_limit, is_active, sort_order)
SELECT 'Meal Card', 'Meal card for canteen usage', 60, 10, TRUE, 2
WHERE NOT EXISTS (SELECT 1 FROM social_membership_addons WHERE name = 'Meal Card');

INSERT INTO social_membership_addons (name, description, price, usage_limit, is_active, sort_order)
SELECT 'Drink Card', 'Drink card for canteen usage', 40, 10, TRUE, 3
WHERE NOT EXISTS (SELECT 1 FROM social_membership_addons WHERE name = 'Drink Card');
