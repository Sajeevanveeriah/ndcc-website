-- Focused remediation pass for content rendering, payment workflow, and admin usability

ALTER TABLE news
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_news_sort_order
  ON news (sort_order, published_at DESC, created_at DESC);

ALTER TABLE kitchen_orders
  ADD COLUMN IF NOT EXISTS processed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_registrations_payment_reference
  ON event_registrations (payment_reference)
  WHERE payment_reference IS NOT NULL;

UPDATE content_blocks
SET
  title = REPLACE(COALESCE(title, ''), 'Newcomb Power Football Club', 'Newcomb Power Football & Netball Club'),
  body = REPLACE(
    REPLACE(
      REPLACE(COALESCE(body, ''), '\\n', E'\n'),
      '—', ' - '
    ),
    'Newcomb Power Football Club',
    'Newcomb Power Football & Netball Club'
  ),
  cta_label = REPLACE(COALESCE(cta_label, ''), '—', ' - ')
WHERE block_key IN ('about.affiliation', 'about.partnership', 'about.goodsports', 'merch.ordering');

UPDATE content_blocks
SET body = 'Use this section for customer-facing ordering guidance, including collection windows and bank transfer details.'
WHERE block_key = 'merch.ordering'
  AND body ILIKE 'Use this section to provide ordering notes%';

INSERT INTO page_link_cards (page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active)
SELECT 'about', 'articles', 'Club History Timeline', 'Read about NDCC milestones, eras, and competition history.', '/about', '📘', NULL, FALSE, 1, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM page_link_cards WHERE page_slug = 'about' AND section_key = 'articles'
);

INSERT INTO page_link_cards (page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active)
SELECT 'facilities', 'articles', 'Training Facility Guide', 'Learn about public net access, club lane usage, and facility details.', '/facilities', '🏟️', NULL, FALSE, 1, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM page_link_cards WHERE page_slug = 'facilities' AND section_key = 'articles'
);

NOTIFY pgrst, 'reload schema';
