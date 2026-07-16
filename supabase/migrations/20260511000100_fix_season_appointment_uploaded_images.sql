-- Fix known 2026/27 Season Appointment CMS-upload image paths that were saved with
-- non-public or stale local paths. Exact-name updates only; valid external URLs are preserved.

WITH fixed_images (name, image_url) AS (
  VALUES
    ('caitlin-rose neil', '/images/2026/05/caitlin-rose-neil-1778495351649.png'),
    ('jodie clark', '/images/2026/05/jodie-clark-1778495304142.png'),
    ('skye green', '/images/2026/05/skye-green-1778495377710.png')
)
UPDATE season_appointments AS existing
SET image_url = fixed_images.image_url
FROM fixed_images
WHERE lower(btrim(existing.name)) = fixed_images.name
  AND (
    existing.image_url IS NULL
    OR btrim(existing.image_url) = ''
    OR (
      existing.image_url !~* '^https?://'
      AND btrim(existing.image_url) <> fixed_images.image_url
    )
  );

NOTIFY pgrst, 'reload schema';
