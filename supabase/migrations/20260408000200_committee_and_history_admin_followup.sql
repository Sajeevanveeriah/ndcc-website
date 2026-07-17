-- Follow-up: admin-managed committee members and history competitions CRUD support

CREATE TABLE IF NOT EXISTS committee_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_committee_members_sort
  ON committee_members (is_active, sort_order);

INSERT INTO committee_members (name, role, sort_order, is_active)
VALUES
  ('John Elliott', 'President', 1, TRUE),
  ('Troy Whitworth', 'Vice President', 2, TRUE),
  ('Laura Hudson', 'Treasurer', 3, TRUE),
  ('Craig Hillgrove', 'Head Coach', 4, TRUE)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
