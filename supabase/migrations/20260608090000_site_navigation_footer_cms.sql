-- CMS completion for header navigation and footer-managed links.
-- Non-destructive and idempotent: uses existing page_link_cards table and only seeds missing rows.

WITH seed_links (page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active) AS (
  VALUES
  ('site', 'header_nav', 'Home', '', '/', NULL, NULL, FALSE, 1, TRUE),
  ('site', 'header_nav', 'About', '', '/about', NULL, NULL, FALSE, 2, TRUE),
  ('site', 'header_nav', 'Teams', '', '/teams', NULL, NULL, FALSE, 3, TRUE),
  ('site', 'header_nav', 'Facilities', '', '/facilities', NULL, NULL, FALSE, 4, TRUE),
  ('site', 'header_nav', 'Fixtures', '', '/fixtures', NULL, NULL, FALSE, 5, TRUE),
  ('site', 'header_nav', 'Fantasy Cricket', '', '/fantasy', NULL, NULL, TRUE, 6, TRUE),
  ('site', 'header_nav', 'Events', '', '/events', NULL, NULL, FALSE, 7, TRUE),
  ('site', 'header_nav', 'Join', '', '/join', NULL, NULL, FALSE, 8, TRUE),
  ('site', 'header_nav', 'News', '', '/news', NULL, NULL, FALSE, 9, TRUE),
  ('site', 'header_nav', 'Merchandise', '', '/merchandise', NULL, NULL, FALSE, 10, TRUE),
  ('site', 'header_nav', 'Kitchen', '', '/kitchen', NULL, NULL, FALSE, 11, TRUE),
  ('site', 'header_nav', 'Sponsors', '', '/sponsors', NULL, NULL, FALSE, 12, TRUE),
  ('site', 'header_nav', 'Gallery', '', '/gallery', NULL, NULL, FALSE, 13, TRUE),
  ('site', 'header_nav', 'Volunteer', '', '/volunteer', NULL, NULL, FALSE, 14, TRUE),
  ('site', 'header_nav', 'Contact', '', '/contact', NULL, NULL, FALSE, 15, TRUE),
  ('site', 'footer_quick_links', 'Home', '', '/', NULL, NULL, FALSE, 1, TRUE),
  ('site', 'footer_quick_links', 'About', '', '/about', NULL, NULL, FALSE, 2, TRUE),
  ('site', 'footer_quick_links', 'Teams', '', '/teams', NULL, NULL, FALSE, 3, TRUE),
  ('site', 'footer_quick_links', 'Facilities', '', '/facilities', NULL, NULL, FALSE, 4, TRUE),
  ('site', 'footer_quick_links', 'Fixtures', '', '/fixtures', NULL, NULL, FALSE, 5, TRUE),
  ('site', 'footer_quick_links', 'Fantasy Cricket', '', '/fantasy', NULL, NULL, TRUE, 6, TRUE),
  ('site', 'footer_get_involved', 'Events', '', '/events', NULL, NULL, FALSE, 1, TRUE),
  ('site', 'footer_get_involved', 'Join', '', '/join', NULL, NULL, FALSE, 2, TRUE),
  ('site', 'footer_get_involved', 'News', '', '/news', NULL, NULL, FALSE, 3, TRUE),
  ('site', 'footer_get_involved', 'Merchandise', '', '/merchandise', NULL, NULL, FALSE, 4, TRUE),
  ('site', 'footer_get_involved', 'Kitchen', '', '/kitchen', NULL, NULL, FALSE, 5, TRUE),
  ('site', 'footer_get_involved', 'Sponsors', '', '/sponsors', NULL, NULL, FALSE, 6, TRUE),
  ('site', 'footer_get_involved', 'Gallery', '', '/gallery', NULL, NULL, FALSE, 7, TRUE),
  ('site', 'footer_get_involved', 'Volunteer', '', '/volunteer', NULL, NULL, FALSE, 8, TRUE),
  ('site', 'footer_get_involved', 'Contact', '', '/contact', NULL, NULL, FALSE, 9, TRUE),
  ('site', 'footer_get_involved', 'Committee Login', '', '/admin/login', NULL, NULL, FALSE, 99, TRUE),
  ('site', 'footer_affiliations', 'Geelong Cricket Association', '', 'https://cricketgeelong.com.au/', NULL, NULL, TRUE, 1, TRUE),
  ('site', 'footer_affiliations', 'Newcomb Power Football & Netball Club', '', 'https://newcombpowerfnc.com.au/', NULL, NULL, TRUE, 2, TRUE),
  ('site', 'footer_affiliations', 'Softball club details', '', '/contact?topic=softball', NULL, NULL, FALSE, 3, TRUE),
  ('site', 'footer_affiliations', 'Darts club details', '', '/contact?topic=darts', NULL, NULL, FALSE, 4, TRUE),
  ('site', 'footer_affiliations', 'Good Sports Level 3', '', 'https://goodsports.com.au/', NULL, NULL, TRUE, 5, TRUE)
)
INSERT INTO page_link_cards (page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active)
SELECT page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active
FROM seed_links seed
WHERE NOT EXISTS (
  SELECT 1
  FROM page_link_cards existing
  WHERE existing.page_slug = seed.page_slug
    AND existing.section_key = seed.section_key
    AND existing.title = seed.title
    AND existing.href = seed.href
);
