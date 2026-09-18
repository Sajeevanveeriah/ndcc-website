-- Signed uploads go to private staging. Only validated files are made public.
-- Rollback: restore the previous route; retain buckets and existing URLs.
DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    VALUES
      ('cms-media-staging', 'cms-media-staging', false, 10485760,
       ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']),
      ('cms-media', 'cms-media', true, 10485760, ARRAY['image/webp','application/pdf'])
    ON CONFLICT(id) DO NOTHING;
  END IF;
END $$;
