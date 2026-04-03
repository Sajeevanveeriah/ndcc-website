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
  order_id UUID REFERENCES orders(id),
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
