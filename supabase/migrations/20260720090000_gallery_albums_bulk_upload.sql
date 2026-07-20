-- Gallery albums + Supabase Storage bulk upload support.
--
-- Adds an album layer over the existing flat gallery_images table so committee
-- users can bulk-upload event photography (e.g. finals day) directly from the
-- browser into Supabase Storage via short-lived signed upload tokens, then
-- publish the album as a unit on the public /gallery routes.
--
-- Backwards compatibility: every existing gallery_images row remains valid.
-- All new gallery_images columns are nullable; rows with album_id IS NULL are
-- "legacy / ungrouped" images and keep rendering exactly as before. image_url
-- remains the display URL; original_url (when present) is the downloadable
-- original stored in the gallery-media bucket.
--
-- Storage: one public-read bucket "gallery-media" (20 MB per object,
-- JPEG/PNG/WebP only). No storage.objects policies are created for anon or
-- authenticated roles — writes happen only through server-issued signed
-- upload tokens (created with the service role) and server-side service-role
-- cleanup. The storage block is guarded so fresh local replays without the
-- Supabase storage schema still apply cleanly.
--
-- Rollback: drop policy public_read_published_gallery_albums; drop table
-- gallery_albums cascade of FK is not needed because gallery_images.album_id
-- is ON DELETE SET NULL — drop the gallery_images columns explicitly if ever
-- required. Leave the bucket and its objects untouched (they may hold real
-- club media); see docs/operations for the cleanup procedure.

-- 1) Albums -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gallery_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
    CONSTRAINT gallery_albums_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  description TEXT NOT NULL DEFAULT '',
  event_date DATE,
  season_label TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  allow_download BOOLEAN NOT NULL DEFAULT TRUE,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  -- Publication consent audit: set when a committee user ticks the
  -- "club has authority to publish" acknowledgement while publishing.
  publish_confirmed_at TIMESTAMPTZ,
  publish_confirmed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_albums_public_list
  ON gallery_albums (published, sort_order ASC, event_date DESC NULLS LAST, created_at DESC);

CREATE OR REPLACE FUNCTION set_gallery_albums_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gallery_albums_updated_at ON gallery_albums;
CREATE TRIGGER trg_gallery_albums_updated_at
BEFORE UPDATE ON gallery_albums
FOR EACH ROW
EXECUTE FUNCTION set_gallery_albums_updated_at();

ALTER TABLE gallery_albums ENABLE ROW LEVEL SECURITY;

-- Public (anon) read of published albums only, mirroring the existing
-- public_read_published_gallery_images policy. All writes stay on the
-- service-role server client, which bypasses RLS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.gallery_albums'::regclass
      AND polname = 'public_read_published_gallery_albums'
  ) THEN
    CREATE POLICY public_read_published_gallery_albums
      ON public.gallery_albums FOR SELECT
      TO anon, authenticated
      USING (published = true);
  END IF;
END $$;

-- 2) Extend gallery_images (all nullable; legacy rows stay valid) -----------
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS album_id UUID;
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS original_url TEXT;
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS height INTEGER;
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ;

-- Preservation-first FK: deleting an album detaches its images (they become
-- ungrouped) rather than destroying rows or Storage objects.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gallery_images_album_id_fkey'
      AND conrelid = 'public.gallery_images'::regclass
  ) THEN
    ALTER TABLE gallery_images
      ADD CONSTRAINT gallery_images_album_id_fkey
      FOREIGN KEY (album_id) REFERENCES gallery_albums(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Album detail queries: published images of one album in display order.
CREATE INDEX IF NOT EXISTS idx_gallery_images_album_public
  ON gallery_images (album_id, published, sort_order ASC, created_at ASC)
  WHERE album_id IS NOT NULL;

-- Storage objects are immutable and unique; one DB row per object.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gallery_images_storage_path
  ON gallery_images (storage_path)
  WHERE storage_path IS NOT NULL;

-- The same photograph may appear in different albums, but accidental
-- duplicate finalisation within ONE album is blocked when a content hash
-- is available.
CREATE UNIQUE INDEX IF NOT EXISTS uq_gallery_images_album_content_hash
  ON gallery_images (album_id, content_hash)
  WHERE album_id IS NOT NULL AND content_hash IS NOT NULL;

-- 3) Storage bucket (guarded: the storage schema exists on Supabase but not
--    in plain-Postgres replay databases used by CI) ------------------------
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage schema absent (local replay database); skipping gallery-media bucket configuration';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'gallery-media',
    'gallery-media',
    true,                                   -- public READ of published site media
    20971520,                               -- 20 MB per original photograph
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
  ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

  -- Deliberately NO storage.objects INSERT/UPDATE/DELETE policies for anon or
  -- authenticated: uploads are authorised exclusively by server-generated
  -- signed upload tokens (service role) after committee-session validation,
  -- and cleanup uses the service-role client which bypasses RLS.
END $$;
