-- Superseded by 20260704_consolidate_committee_auth_canonical.sql - see that file for why.
-- Repair core schema dependencies for orders, committee auth, social memberships, and bank reconciliation.
-- Idempotent and non-destructive. Preserves existing rows.

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

CREATE TABLE IF NOT EXISTS public.committee_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'president', 'secretary', 'committee')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.committee_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.committee_users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.committee_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.committee_sessions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.committee_sessions ADD COLUMN IF NOT EXISTS session_token_hash TEXT;
ALTER TABLE public.committee_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.committee_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.social_membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.social_membership_addons (
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

CREATE TABLE IF NOT EXISTS public.member_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  membership_plan_id UUID REFERENCES public.social_membership_plans(id),
  order_id UUID,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.member_addon_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_application_id UUID NOT NULL REFERENCES public.member_applications(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES public.social_membership_addons(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.imported_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT DEFAULT 'manual_import',
  payer_name TEXT DEFAULT '',
  transaction_reference TEXT DEFAULT '',
  amount NUMERIC(10,2) NOT NULL,
  transaction_date TIMESTAMPTZ NOT NULL,
  raw_data JSONB DEFAULT '{}'::jsonb,
  matched_order_id UUID REFERENCES public.orders(id),
  match_status TEXT NOT NULL DEFAULT 'unmatched',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bank_transfer_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.imported_transactions(id),
  confirmed_by UUID REFERENCES public.committee_users(id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bank_reference_used TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);

DO $$
BEGIN
  IF to_regclass('public.merch_order_windows') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_merch_window_id_fkey' AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_merch_window_id_fkey FOREIGN KEY (merch_window_id) REFERENCES public.merch_order_windows(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_confirmed_by_fkey' AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.committee_users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'member_applications_order_id_fkey' AND conrelid = 'public.member_applications'::regclass) THEN
    ALTER TABLE public.member_applications ADD CONSTRAINT member_applications_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_committee_users_email ON public.committee_users (email);
CREATE INDEX IF NOT EXISTS idx_committee_users_lower_email ON public.committee_users (lower(email));
CREATE INDEX IF NOT EXISTS idx_committee_sessions_user_id ON public.committee_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_committee_sessions_expires_at ON public.committee_sessions (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_committee_sessions_token_hash_unique ON public.committee_sessions (session_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_reference_unique ON public.orders(payment_reference) WHERE payment_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_member_applications_email ON public.member_applications(email);
CREATE INDEX IF NOT EXISTS idx_member_applications_order_id ON public.member_applications(order_id);
CREATE INDEX IF NOT EXISTS idx_member_addon_member_application_id ON public.member_addon_selections(member_application_id);
CREATE INDEX IF NOT EXISTS idx_imported_transactions_reference ON public.imported_transactions(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_imported_transactions_amount ON public.imported_transactions(amount);
CREATE INDEX IF NOT EXISTS idx_imported_transactions_date ON public.imported_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_imported_transactions_match_status ON public.imported_transactions(match_status);
CREATE INDEX IF NOT EXISTS idx_bank_transfer_confirmations_order_id ON public.bank_transfer_confirmations(order_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_membership_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_addon_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imported_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transfer_confirmations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'committee_users' AND policyname = 'No direct public access to committee_users') THEN
    CREATE POLICY "No direct public access to committee_users" ON public.committee_users FOR ALL USING (FALSE) WITH CHECK (FALSE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'committee_sessions' AND policyname = 'No direct public access to committee_sessions') THEN
    CREATE POLICY "No direct public access to committee_sessions" ON public.committee_sessions FOR ALL USING (FALSE) WITH CHECK (FALSE);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ndcc_verify_committee_user(
  p_email TEXT,
  p_password TEXT
)
RETURNS TABLE (id UUID, email TEXT, full_name TEXT, role TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT u.id, u.email, u.full_name, u.role
  FROM public.committee_users u
  WHERE lower(u.email) = lower(p_email)
    AND u.is_active = TRUE
    AND u.password_hash = crypt(p_password, u.password_hash)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ndcc_set_committee_password(p_user_id UUID, p_password TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  UPDATE public.committee_users
  SET password_hash = crypt(p_password, gen_salt('bf', 10)),
      updated_at = NOW()
  WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.ndcc_admin_create_committee_user(
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_password TEXT,
  p_created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_user_id UUID;
  creator_role TEXT;
BEGIN
  SELECT u.role INTO creator_role FROM public.committee_users u WHERE u.id = p_created_by AND u.is_active = TRUE;

  IF creator_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can create committee users';
  END IF;

  INSERT INTO public.committee_users(email, full_name, password_hash, role)
  VALUES (lower(trim(p_email)), trim(p_full_name), crypt(p_password, gen_salt('bf', 10)), p_role)
  RETURNING committee_users.id INTO new_user_id;

  RETURN new_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ndcc_bootstrap_first_admin(
  p_email TEXT,
  p_full_name TEXT,
  p_password TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  existing_admins INTEGER;
  new_user_id UUID;
BEGIN
  SELECT count(*)::int INTO existing_admins FROM public.committee_users u WHERE u.role = 'admin' AND u.is_active = TRUE;

  IF existing_admins > 0 THEN
    RAISE EXCEPTION 'Bootstrap disabled: an active admin already exists';
  END IF;

  INSERT INTO public.committee_users(email, full_name, password_hash, role)
  VALUES (lower(trim(p_email)), trim(p_full_name), crypt(p_password, gen_salt('bf', 10)), 'admin')
  RETURNING committee_users.id INTO new_user_id;

  RETURN new_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ndcc_verify_committee_user(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ndcc_set_committee_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ndcc_admin_create_committee_user(TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ndcc_bootstrap_first_admin(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ndcc_verify_committee_user(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ndcc_set_committee_password(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ndcc_admin_create_committee_user(TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.ndcc_bootstrap_first_admin(TEXT, TEXT, TEXT) TO service_role;
