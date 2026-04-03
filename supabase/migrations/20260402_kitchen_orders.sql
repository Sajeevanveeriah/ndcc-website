CREATE TABLE IF NOT EXISTS kitchen_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kitchen_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id UUID NOT NULL REFERENCES kitchen_menus(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kitchen_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES committee_users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted',
  payment_status TEXT NOT NULL DEFAULT 'pending_bank_transfer',
  payment_reference TEXT,
  linked_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kitchen_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES kitchen_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES kitchen_items(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_items_menu_id ON kitchen_items(menu_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_items_available ON kitchen_items(is_available, is_hidden);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_created_at ON kitchen_orders(created_at DESC);

INSERT INTO kitchen_menus (name, is_active)
SELECT 'Weekly Canteen Menu', TRUE
WHERE NOT EXISTS (SELECT 1 FROM kitchen_menus WHERE is_active = TRUE);
