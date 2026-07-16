-- Gallery images management table for public gallery + admin CMS workflows.
CREATE TABLE IF NOT EXISTS gallery_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  allow_download BOOLEAN NOT NULL DEFAULT FALSE,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_images_sort_order ON gallery_images(sort_order ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_images_published ON gallery_images(published);

CREATE OR REPLACE FUNCTION set_gallery_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gallery_images_updated_at ON gallery_images;
CREATE TRIGGER trg_gallery_images_updated_at
BEFORE UPDATE ON gallery_images
FOR EACH ROW
EXECUTE FUNCTION set_gallery_images_updated_at();

INSERT INTO gallery_images (title, caption, image_url, alt_text, sort_order, allow_download, published)
VALUES
  ('Grinter Reserve', 'Grinter Reserve', '/images/Turf_Ground.jpg', 'Grinter Reserve at dusk showing the full oval, floodlights, and pavilion', 10, FALSE, TRUE),
  ('Turf Wicket', 'Turf Wicket', '/images/Turf.jpg', 'Close-up of the turf wicket square with white crease markings and blue sky', 20, FALSE, TRUE),
  ('Senior Women', 'Senior Women', '/images/Womens_Team.jpg', 'NDCC Senior Women team group photo in maroon club kit', 30, FALSE, TRUE),
  ('Match Day', 'Match Day', '/images/Womens_Teams_2.jpg', 'NDCC women in maroon and opposition in blue lined up before a match', 40, FALSE, TRUE)
ON CONFLICT DO NOTHING;
