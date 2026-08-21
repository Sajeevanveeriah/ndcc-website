-- Align CMS-managed current-season navigation with the Dino Coach product name.
-- Route compatibility remains /fantasy; only active user-facing presentation changes.

update public.page_link_cards
set title = 'Dino Coach',
    is_external = false
where page_slug = 'site'
  and href = '/fantasy'
  and title = 'Fantasy Cricket';
