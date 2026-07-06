-- Footer/nav link hygiene (2026-07-06)
-- Local routes (e.g. /fantasy) were seeded with is_external = TRUE, which made the
-- header/footer open them in a new tab. Only real http(s) URLs are external.
-- Idempotent: safe to re-run.

update page_link_cards
set is_external = false
where is_external = true
  and href like '/%'
  and href not like '//%';
