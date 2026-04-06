CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS season_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  image_url TEXT,
  announcement_date DATE NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_season_appointments_active_sort
  ON season_appointments(is_active, sort_order, announcement_date DESC);

CREATE OR REPLACE FUNCTION set_season_appointments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_season_appointments_updated_at ON season_appointments;
CREATE TRIGGER trg_season_appointments_updated_at
BEFORE UPDATE ON season_appointments
FOR EACH ROW
EXECUTE FUNCTION set_season_appointments_updated_at();

INSERT INTO season_appointments (name, role, image_url, announcement_date, sort_order, is_active)
VALUES
  ('Craig Hillgrove', 'Head Coach', NULL, '2026-03-01', 1, TRUE),
  ('Kelsey Allan', 'Women''s Coach', '/images/Poster.png', '2026-03-15', 2, TRUE)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
