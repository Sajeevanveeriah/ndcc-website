-- Make the current Billy G's Cookie Dough fundraiser discoverable through
-- Supabase-managed site chrome without duplicating an existing row.

WITH fundraiser_links (page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active) AS (
  VALUES
    ('site', 'header_nav', 'Cookie Dough Fundraiser', '', '/fundraising/cookie-dough', NULL, NULL, FALSE, 17, TRUE),
    ('site', 'footer_get_involved', 'Cookie Dough Fundraiser', '', '/fundraising/cookie-dough', NULL, NULL, FALSE, 11, TRUE)
)
INSERT INTO public.page_link_cards (page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active)
SELECT page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active
FROM fundraiser_links candidate
WHERE NOT EXISTS (
  SELECT 1
  FROM public.page_link_cards existing
  WHERE existing.page_slug = candidate.page_slug
    AND existing.section_key = candidate.section_key
    AND existing.href = candidate.href
);
