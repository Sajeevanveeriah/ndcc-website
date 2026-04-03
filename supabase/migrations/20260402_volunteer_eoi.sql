CREATE TABLE IF NOT EXISTS volunteer_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS volunteer_expressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  volunteer_position_id UUID REFERENCES volunteer_positions(id),
  availability TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  follow_up_notes TEXT DEFAULT '',
  contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_volunteer_expressions_status ON volunteer_expressions(status);
CREATE INDEX IF NOT EXISTS idx_volunteer_expressions_email ON volunteer_expressions(email);

INSERT INTO volunteer_positions (title, description, is_active, sort_order)
SELECT 'Canteen', 'Match-day canteen support', TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM volunteer_positions WHERE title = 'Canteen');

INSERT INTO volunteer_positions (title, description, is_active, sort_order)
SELECT 'Scorer', 'Scoring support for matches', TRUE, 2
WHERE NOT EXISTS (SELECT 1 FROM volunteer_positions WHERE title = 'Scorer');

INSERT INTO volunteer_positions (title, description, is_active, sort_order)
SELECT 'Ground Setup', 'Ground setup and pack down', TRUE, 3
WHERE NOT EXISTS (SELECT 1 FROM volunteer_positions WHERE title = 'Ground Setup');

INSERT INTO volunteer_positions (title, description, is_active, sort_order)
SELECT 'General Help', 'General volunteer assistance', TRUE, 4
WHERE NOT EXISTS (SELECT 1 FROM volunteer_positions WHERE title = 'General Help');
