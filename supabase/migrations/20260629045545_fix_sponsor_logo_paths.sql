-- History-alignment copy. This migration was applied directly to the remote
-- database (version 20260629045545) without a matching file in this
-- directory. The SQL below is recovered verbatim from
-- supabase_migrations.schema_migrations.statements. Do not edit and do not
-- re-apply manually: the remote history already records it as applied.

-- Ensure active sponsors without uploaded logos still reach the public marquee.
-- The React SafeImage fallback renders a branded card if the local asset is missing.

UPDATE public.sponsors
SET logo_url = '/images/sponsors/mbr-cricket-logo.png'
WHERE lower(trim(name)) = 'mbr cricket'
  AND nullif(trim(coalesce(logo_url, '')), '') IS NULL;

UPDATE public.sponsors
SET logo_url = '/images/sponsors/leopold-sportsmans-club-logo.png'
WHERE lower(trim(name)) = 'leopold sportsmans club'
  AND nullif(trim(coalesce(logo_url, '')), '') IS NULL;

NOTIFY pgrst, 'reload schema';
