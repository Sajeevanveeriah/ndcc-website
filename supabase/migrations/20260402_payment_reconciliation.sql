ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_status TEXT DEFAULT 'submitted';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bank_reference_used TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES committee_users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS needs_review_reason TEXT DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_reference_unique ON orders(payment_reference) WHERE payment_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

CREATE TABLE IF NOT EXISTS imported_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT DEFAULT 'manual_import',
  payer_name TEXT DEFAULT '',
  transaction_reference TEXT DEFAULT '',
  amount NUMERIC(10,2) NOT NULL,
  transaction_date TIMESTAMPTZ NOT NULL,
  raw_data JSONB DEFAULT '{}'::jsonb,
  matched_order_id UUID REFERENCES orders(id),
  match_status TEXT NOT NULL DEFAULT 'unmatched',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imported_transactions_reference ON imported_transactions(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_imported_transactions_amount ON imported_transactions(amount);
CREATE INDEX IF NOT EXISTS idx_imported_transactions_date ON imported_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_imported_transactions_match_status ON imported_transactions(match_status);

CREATE TABLE IF NOT EXISTS bank_transfer_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES imported_transactions(id),
  confirmed_by UUID REFERENCES committee_users(id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bank_reference_used TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_confirmations_order_id ON bank_transfer_confirmations(order_id);
