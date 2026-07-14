-- CMS-managed publications: monthly newsletters, weekly newsletters and
-- weekly match reports in one coherent model.
--
-- Additive only. Rollback:
--   DROP TRIGGER IF EXISTS trg_publications_updated_at ON publications;
--   DROP FUNCTION IF EXISTS set_publications_updated_at();
--   DROP TABLE IF EXISTS publications;

CREATE TABLE IF NOT EXISTS publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_type TEXT NOT NULL DEFAULT 'weekly_match_report'
    CHECK (publication_type IN ('monthly_newsletter', 'weekly_newsletter', 'weekly_match_report')),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  summary TEXT,
  content TEXT NOT NULL DEFAULT '',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  season_label TEXT,
  round_label TEXT,
  cover_image_url TEXT,
  document_url TEXT,
  external_url TEXT,
  author TEXT DEFAULT 'NDCC',
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_publications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_publications_updated_at ON publications;
CREATE TRIGGER trg_publications_updated_at
  BEFORE UPDATE ON publications
  FOR EACH ROW EXECUTE FUNCTION set_publications_updated_at();

CREATE INDEX IF NOT EXISTS idx_publications_public_listing
  ON publications (published, publication_type, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_publications_featured
  ON publications (featured) WHERE featured = TRUE;

ALTER TABLE publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published publications" ON publications;
CREATE POLICY "Public can read published publications"
  ON publications FOR SELECT
  USING (published = TRUE);

NOTIFY pgrst, 'reload schema';

-- Nav/footer: surface Publications via the existing page_link_cards CMS
-- (idempotent; follows the calendar_events seed pattern).
WITH seed_links (page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active) AS (
  VALUES
  ('site', 'footer_quick_links', 'Publications', '', '/publications', NULL, NULL, FALSE, 12, TRUE)
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
