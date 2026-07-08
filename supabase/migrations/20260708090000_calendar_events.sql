-- NDCC club calendar: new calendar_events table.
-- Additive and idempotent. The existing events table stays untouched — it remains
-- the ticketed-event/registration CMS; calendar_events is the organising calendar
-- layer (training, matches, meetings, social nights) and can link to /events/[id]
-- via cta_url when an entry has a registration page.

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  location TEXT,
  venue_address TEXT,
  event_type TEXT NOT NULL DEFAULT 'club',
  category TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'published',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  show_on_home BOOLEAN NOT NULL DEFAULT TRUE,
  show_on_contact BOOLEAN NOT NULL DEFAULT TRUE,
  show_on_calendar BOOLEAN NOT NULL DEFAULT TRUE,
  image_url TEXT,
  external_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  registration_required BOOLEAN NOT NULL DEFAULT FALSE,
  ticket_price NUMERIC(10,2),
  capacity INTEGER,
  colour TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  recurrence_rule TEXT,
  recurrence_until TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'cms',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_events_event_type_check CHECK (event_type IN (
    'club', 'training', 'match', 'junior', 'women', 'social', 'committee',
    'fundraiser', 'sponsor', 'kitchen', 'registration', 'other'
  )),
  CONSTRAINT calendar_events_visibility_check CHECK (visibility IN (
    'public', 'members', 'committee', 'draft'
  )),
  CONSTRAINT calendar_events_status_check CHECK (status IN (
    'draft', 'published', 'cancelled', 'postponed', 'archived'
  )),
  CONSTRAINT calendar_events_end_after_start_check CHECK (end_at IS NULL OR end_at >= start_at),
  CONSTRAINT calendar_events_ticket_price_check CHECK (ticket_price IS NULL OR ticket_price >= 0),
  CONSTRAINT calendar_events_capacity_check CHECK (capacity IS NULL OR capacity > 0)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start_at ON calendar_events (start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events (status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_visibility ON calendar_events (visibility);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_type ON calendar_events (event_type);
-- Composite covering the public feed hot path: published+public rows ordered by start.
CREATE INDEX IF NOT EXISTS idx_calendar_events_public_feed
  ON calendar_events (status, visibility, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_show_on_home
  ON calendar_events (show_on_home) WHERE show_on_home = TRUE;
CREATE INDEX IF NOT EXISTS idx_calendar_events_show_on_contact
  ON calendar_events (show_on_contact) WHERE show_on_contact = TRUE;
CREATE INDEX IF NOT EXISTS idx_calendar_events_show_on_calendar
  ON calendar_events (show_on_calendar) WHERE show_on_calendar = TRUE;

CREATE OR REPLACE FUNCTION set_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at
BEFORE UPDATE ON calendar_events
FOR EACH ROW
EXECUTE FUNCTION set_calendar_events_updated_at();

-- RLS: the app reads/writes through the service-role key server-side (RLS bypassed),
-- but policies are defined so direct anon access can only ever see published public rows.
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published public calendar events" ON calendar_events;
CREATE POLICY "Public can read published public calendar events"
  ON calendar_events FOR SELECT
  USING (status = 'published' AND visibility = 'public' AND show_on_calendar = TRUE);

-- Nav/footer: add Calendar links via the existing page_link_cards CMS (idempotent).
WITH seed_links (page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active) AS (
  VALUES
  ('site', 'header_nav', 'Calendar', '', '/calendar', NULL, NULL, FALSE, 16, TRUE),
  ('site', 'footer_get_involved', 'Calendar', '', '/calendar', NULL, NULL, FALSE, 10, TRUE)
)
INSERT INTO page_link_cards (page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active)
SELECT page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active
FROM seed_links seed
WHERE NOT EXISTS (
  SELECT 1
  FROM page_link_cards existing
  WHERE existing.page_slug = seed.page_slug
    AND existing.section_key = seed.section_key
    AND existing.href = seed.href
);

NOTIFY pgrst, 'reload schema';
