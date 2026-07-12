-- Club-wide season source of truth (additive + reversible).
--
-- Fantasy seasons remain Fantasy-specific. club_seasons is the operational club
-- season model used by CMS content, registrations, teams, training, PlayHQ
-- mappings, merchandise windows, sponsor periods and Fantasy linkage.
-- Existing tables keep their old fields and gain nullable transitional foreign
-- keys so current pages continue to work while CMS records are reviewed.
--
-- Rollback:
--   ALTER TABLE teams DROP COLUMN IF EXISTS club_season_id;
--   ALTER TABLE season_appointments DROP COLUMN IF EXISTS club_season_id;
--   ALTER TABLE calendar_events DROP COLUMN IF EXISTS club_season_id;
--   ALTER TABLE content_blocks DROP COLUMN IF EXISTS club_season_id;
--   ALTER TABLE merch_order_windows DROP COLUMN IF EXISTS club_season_id;
--   ALTER TABLE sponsors DROP COLUMN IF EXISTS club_season_id;
--   DROP TABLE IF EXISTS club_season_merch_windows;
--   DROP TABLE IF EXISTS club_season_sponsor_periods;
--   DROP TABLE IF EXISTS club_season_fantasy_links;
--   DROP TABLE IF EXISTS club_season_notices;
--   DROP TABLE IF EXISTS club_season_registration_settings;
--   DROP TABLE IF EXISTS club_season_training_schedules;
--   DROP TABLE IF EXISTS club_season_playhq_team_mappings;
--   DROP TABLE IF EXISTS club_season_playhq_grade_mappings;
--   DROP TABLE IF EXISTS club_season_teams;
--   DROP TABLE IF EXISTS club_seasons;
--   DROP TYPE IF EXISTS club_season_status;
--   DROP TYPE IF EXISTS club_season_registration_status;

CREATE TYPE club_season_status AS ENUM ('draft', 'upcoming', 'active', 'completed', 'archived');
CREATE TYPE club_season_registration_status AS ENUM ('closed', 'opening_soon', 'open', 'waitlist', 'archived');

CREATE TABLE IF NOT EXISTS club_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status club_season_status NOT NULL DEFAULT 'draft',
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  playhq_season_id TEXT UNIQUE,
  registration_status club_season_registration_status NOT NULL DEFAULT 'closed',
  registration_url TEXT,
  source_season_id UUID REFERENCES club_seasons(id) ON DELETE SET NULL,
  scheduled_activation_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_seasons_date_order CHECK (end_date >= start_date),
  CONSTRAINT club_seasons_registration_url_check CHECK (registration_url IS NULL OR registration_url ~* '^https?://')
);

CREATE UNIQUE INDEX IF NOT EXISTS club_seasons_one_current_idx ON club_seasons(is_current) WHERE is_current;
CREATE INDEX IF NOT EXISTS club_seasons_status_dates_idx ON club_seasons(status, start_date DESC, end_date DESC);
CREATE INDEX IF NOT EXISTS club_seasons_scheduled_activation_idx ON club_seasons(scheduled_activation_at) WHERE scheduled_activation_at IS NOT NULL;

DROP TRIGGER IF EXISTS trg_club_seasons_updated_at ON club_seasons;
CREATE TRIGGER trg_club_seasons_updated_at
BEFORE UPDATE ON club_seasons
FOR EACH ROW EXECUTE FUNCTION set_fantasy_updated_at();

INSERT INTO club_seasons (name, slug, start_date, end_date, status, is_current, registration_status, created_by)
SELECT '2026/2027 Season', '2026-27', DATE '2026-10-01', DATE '2027-03-31', 'active', TRUE, 'open', 'migration'
WHERE NOT EXISTS (SELECT 1 FROM club_seasons WHERE is_current);

INSERT INTO club_seasons (name, slug, start_date, end_date, status, is_current, registration_status, created_by)
SELECT '2025/2026 Season', '2025-26', DATE '2025-10-01', DATE '2026-03-31', 'completed', FALSE, 'archived', 'migration'
WHERE NOT EXISTS (SELECT 1 FROM club_seasons WHERE slug = '2025-26');

CREATE TABLE IF NOT EXISTS club_season_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_season_id UUID NOT NULL REFERENCES club_seasons(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  grade TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  inherited_from_id UUID REFERENCES club_season_teams(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_season_id, name)
);

CREATE TABLE IF NOT EXISTS club_season_playhq_grade_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_season_id UUID NOT NULL REFERENCES club_seasons(id) ON DELETE CASCADE,
  playhq_grade_id TEXT NOT NULL,
  grade_name TEXT NOT NULL,
  team_filter TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_season_id, playhq_grade_id)
);

CREATE TABLE IF NOT EXISTS club_season_playhq_team_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_season_id UUID NOT NULL REFERENCES club_seasons(id) ON DELETE CASCADE,
  club_season_team_id UUID REFERENCES club_season_teams(id) ON DELETE CASCADE,
  playhq_team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  playhq_grade_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_season_id, playhq_team_id)
);

CREATE TABLE IF NOT EXISTS club_season_training_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_season_id UUID NOT NULL REFERENCES club_seasons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  day_of_week TEXT,
  start_time TIME,
  end_time TIME,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  inherited_from_id UUID REFERENCES club_season_training_schedules(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_season_training_time_order CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time)
);

CREATE TABLE IF NOT EXISTS club_season_registration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_season_id UUID NOT NULL UNIQUE REFERENCES club_seasons(id) ON DELETE CASCADE,
  status club_season_registration_status NOT NULL DEFAULT 'closed',
  registration_url TEXT,
  instructions TEXT,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  inherited_from_id UUID REFERENCES club_season_registration_settings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_season_registration_url_check CHECK (registration_url IS NULL OR registration_url ~* '^https?://'),
  CONSTRAINT club_season_registration_dates_check CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at >= opens_at)
);

CREATE TABLE IF NOT EXISTS club_season_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_season_id UUID NOT NULL REFERENCES club_seasons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  placement TEXT NOT NULL DEFAULT 'homepage' CHECK (placement IN ('homepage','fixtures','join','fantasy','sitewide')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','archived')),
  visible_from TIMESTAMPTZ,
  visible_until TIMESTAMPTZ,
  inherited_from_id UUID REFERENCES club_season_notices(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_season_notices_dates_check CHECK (visible_until IS NULL OR visible_from IS NULL OR visible_until >= visible_from)
);

CREATE TABLE IF NOT EXISTS club_season_fantasy_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_season_id UUID NOT NULL UNIQUE REFERENCES club_seasons(id) ON DELETE CASCADE,
  fantasy_season_id UUID REFERENCES fantasy_seasons(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','linked','disabled','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS club_season_sponsor_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_season_id UUID NOT NULL REFERENCES club_seasons(id) ON DELETE CASCADE,
  sponsor_id UUID,
  starts_on DATE,
  ends_on DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  inherited_from_id UUID REFERENCES club_season_sponsor_periods(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT club_season_sponsor_period_dates_check CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS club_season_merch_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_season_id UUID NOT NULL REFERENCES club_seasons(id) ON DELETE CASCADE,
  merch_window_id UUID REFERENCES merch_order_windows(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  inherited_from_id UUID REFERENCES club_season_merch_windows(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_season_id, merch_window_id)
);

ALTER TABLE teams ADD COLUMN IF NOT EXISTS club_season_id UUID REFERENCES club_seasons(id) ON DELETE SET NULL;
ALTER TABLE season_appointments ADD COLUMN IF NOT EXISTS club_season_id UUID REFERENCES club_seasons(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS club_season_id UUID REFERENCES club_seasons(id) ON DELETE SET NULL;
ALTER TABLE content_blocks ADD COLUMN IF NOT EXISTS club_season_id UUID REFERENCES club_seasons(id) ON DELETE SET NULL;
ALTER TABLE merch_order_windows ADD COLUMN IF NOT EXISTS club_season_id UUID REFERENCES club_seasons(id) ON DELETE SET NULL;
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS club_season_id UUID REFERENCES club_seasons(id) ON DELETE SET NULL;

UPDATE teams SET club_season_id = (SELECT id FROM club_seasons WHERE is_current) WHERE club_season_id IS NULL;
UPDATE season_appointments SET club_season_id = (SELECT id FROM club_seasons WHERE is_current) WHERE club_season_id IS NULL;
UPDATE calendar_events SET club_season_id = (SELECT id FROM club_seasons WHERE is_current) WHERE club_season_id IS NULL AND start_at >= DATE '2026-07-01';
UPDATE merch_order_windows SET club_season_id = (SELECT id FROM club_seasons WHERE is_current) WHERE club_season_id IS NULL AND active = TRUE;

INSERT INTO club_season_teams (club_season_id, team_id, name, grade, status, sort_order)
SELECT COALESCE(t.club_season_id, (SELECT id FROM club_seasons WHERE is_current)), t.id, t.name, t.grade, CASE WHEN t.is_active THEN 'active' ELSE 'archived' END, t.sort_order
FROM teams t
ON CONFLICT (club_season_id, name) DO NOTHING;

INSERT INTO club_season_registration_settings (club_season_id, status, registration_url, instructions)
SELECT id, registration_status, registration_url, 'Transitional registration settings created from club_seasons. Review in CMS before publishing.'
FROM club_seasons
ON CONFLICT (club_season_id) DO NOTHING;

INSERT INTO club_season_fantasy_links (club_season_id, fantasy_season_id, status)
SELECT cs.id, fs.id, 'linked'
FROM club_seasons cs
JOIN fantasy_seasons fs ON fs.slug = cs.slug
ON CONFLICT (club_season_id) DO NOTHING;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['club_season_teams','club_season_playhq_grade_mappings','club_season_playhq_team_mappings','club_season_training_schedules','club_season_registration_settings','club_season_notices','club_season_fantasy_links','club_season_sponsor_periods','club_season_merch_windows'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', tbl, tbl);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_fantasy_updated_at()', tbl, tbl);
  END LOOP;
END $$;

ALTER TABLE club_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_season_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_season_playhq_grade_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_season_playhq_team_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_season_training_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_season_registration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_season_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_season_fantasy_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_season_sponsor_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_season_merch_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_seasons_public_current ON club_seasons;
CREATE POLICY club_seasons_public_current ON club_seasons FOR SELECT USING (status IN ('active','completed') OR is_current = TRUE);

DROP POLICY IF EXISTS club_season_teams_public ON club_season_teams;
CREATE POLICY club_season_teams_public ON club_season_teams FOR SELECT USING (status = 'active');

DROP POLICY IF EXISTS club_season_training_public ON club_season_training_schedules;
CREATE POLICY club_season_training_public ON club_season_training_schedules FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS club_season_notices_public ON club_season_notices;
CREATE POLICY club_season_notices_public ON club_season_notices FOR SELECT USING (status = 'published' AND (visible_from IS NULL OR visible_from <= NOW()) AND (visible_until IS NULL OR visible_until >= NOW()));

DROP POLICY IF EXISTS club_season_registration_public ON club_season_registration_settings;
CREATE POLICY club_season_registration_public ON club_season_registration_settings FOR SELECT USING (status IN ('opening_soon','open','waitlist'));

-- Mapping/linkage tables are CMS/server-only during transition.
DROP POLICY IF EXISTS club_season_playhq_grade_no_public ON club_season_playhq_grade_mappings;
DROP POLICY IF EXISTS club_season_playhq_team_no_public ON club_season_playhq_team_mappings;
DROP POLICY IF EXISTS club_season_fantasy_links_no_public ON club_season_fantasy_links;
DROP POLICY IF EXISTS club_season_sponsor_periods_no_public ON club_season_sponsor_periods;
DROP POLICY IF EXISTS club_season_merch_windows_no_public ON club_season_merch_windows;
CREATE POLICY club_season_playhq_grade_no_public ON club_season_playhq_grade_mappings FOR ALL USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY club_season_playhq_team_no_public ON club_season_playhq_team_mappings FOR ALL USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY club_season_fantasy_links_no_public ON club_season_fantasy_links FOR ALL USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY club_season_sponsor_periods_no_public ON club_season_sponsor_periods FOR ALL USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY club_season_merch_windows_no_public ON club_season_merch_windows FOR ALL USING (FALSE) WITH CHECK (FALSE);

CREATE INDEX IF NOT EXISTS teams_club_season_idx ON teams(club_season_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS season_appointments_club_season_idx ON season_appointments(club_season_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS calendar_events_club_season_idx ON calendar_events(club_season_id, start_at);
CREATE INDEX IF NOT EXISTS content_blocks_club_season_idx ON content_blocks(club_season_id, page_slug);
CREATE INDEX IF NOT EXISTS merch_order_windows_club_season_idx ON merch_order_windows(club_season_id, active);
CREATE INDEX IF NOT EXISTS sponsors_club_season_idx ON sponsors(club_season_id);

NOTIFY pgrst, 'reload schema';
