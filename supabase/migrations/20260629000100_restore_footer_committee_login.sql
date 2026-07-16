UPDATE page_link_cards
SET is_active = TRUE,
    sort_order = 99
WHERE page_slug = 'site'
  AND section_key = 'footer_get_involved'
  AND title = 'Committee Login'
  AND href = '/admin/login';

INSERT INTO page_link_cards (
  page_slug,
  section_key,
  title,
  description,
  href,
  icon,
  badge,
  is_external,
  sort_order,
  is_active
)
SELECT
  'site',
  'footer_get_involved',
  'Committee Login',
  '',
  '/admin/login',
  NULL,
  NULL,
  FALSE,
  99,
  TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM page_link_cards
  WHERE page_slug = 'site'
    AND section_key = 'footer_get_involved'
    AND title = 'Committee Login'
    AND href = '/admin/login'
);

NOTIFY pgrst, 'reload schema';
