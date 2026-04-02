CREATE TABLE IF NOT EXISTS content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_key TEXT UNIQUE NOT NULL,
  page_slug TEXT NOT NULL,
  section_label TEXT NOT NULL,
  title TEXT,
  body TEXT,
  image_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_blocks_page_slug ON content_blocks(page_slug, is_active);

CREATE OR REPLACE FUNCTION set_content_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_content_blocks_updated_at ON content_blocks;
CREATE TRIGGER trg_content_blocks_updated_at
BEFORE UPDATE ON content_blocks
FOR EACH ROW
EXECUTE FUNCTION set_content_blocks_updated_at();

INSERT INTO content_blocks (block_key, page_slug, section_label, title, body, is_active)
VALUES
  ('home.hero', 'home', 'Hero', 'Newcomb and District Cricket Club', 'Home of the Dinos cricket community.', TRUE),
  ('home.quicklinks', 'home', 'Quick links', 'Explore the Club', 'Everything you need to know about the Dinos.', TRUE),
  ('footer.acknowledgement', 'footer', 'Acknowledgement', NULL, NULL, TRUE),
  ('about.history', 'about', 'History', 'Our History', NULL, TRUE),
  ('join.hero', 'join', 'Join hero', 'Join the Club', NULL, TRUE),
  ('volunteer.hero', 'volunteer', 'Volunteer hero', 'Volunteer with Us', NULL, TRUE),
  ('sponsors.intro', 'sponsors', 'Sponsors intro', 'Community Support', NULL, TRUE)
ON CONFLICT (block_key) DO NOTHING;
