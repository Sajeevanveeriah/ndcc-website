-- Dino Socks sizes: 7-11 and 12+ (requested by Saj, 7 October 2026),
-- replacing the provisional S, M, L carried over from the previous club sock
-- listing in 20261001040000_apparel_limited_edition_2026_27.sql.
--
-- Guarded: changes the sizes only while they are still the seeded S, M, L,
-- so a later correction made in Admin > Apparel is preserved. Existing orders
-- keep the size recorded on them. The archived cricket-socks row is untouched.
-- Repeatable.

update public.apparel_products
set sizes = array['7-11','12+']
where slug = 'dino-socks'
  and sizes = array['S','M','L'];
