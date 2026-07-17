-- 2026/27 apparel catalogue reconciliation.
--
-- Source of truth: supplier asset pack
-- 20260716-NDCC-Apparel-Website-Assets-Rev00 (manifest committed at
-- assets/apparel-masters/2026-27/manifest.json). Reconciles the 26 existing
-- rows to the 19 authoritative products:
--   - 9 rows updated in place (slug already canonical)
--   - 5 rows renamed to their canonical slug and updated in place
--   - 5 new rows inserted (jumper, bomber-jacket, wide-brim-hat, baggy-cap,
--     bucket-hat)
--   - 12 legacy/duplicate rows archived with active = false (NOT deleted)
--
-- Deliberate decisions (per the season-readiness brief):
--   - sizes are cleared to empty: the supplier pack contains no size data
--     and the previous size lists were dev-seeded, not supplier-verified.
--   - The four hats (wide-brim-hat, baggy-cap, cap, bucket-hat) have NO
--     product artwork (manifest image_supplied=false). They stay
--     active=false with image_url='' until real photography arrives; the
--     placeholder canvases are kept out of public/.
--   - No hood surcharge is created for the Sports Jacket; the hood variant
--     is recorded at $0 delta because no surcharge was supplied.
--   - customisable flags are preserved on existing rows (playing-shirt
--     keeps name/number personalisation) and default to false on inserts.
--
-- Rollback: restore the field values captured in
-- docs/operations/backups/20260716-apparel-products-pre-2026-27-catalogue.json
-- (keyed by id) and delete rows from apparel_product_options seeded below.

-- 1) Canonical slug renames (guarded: only when the old row exists and the
--    canonical slug is still free).
update public.apparel_products set slug = 'singlet'
  where slug = 'training-singlet'
    and not exists (select 1 from public.apparel_products where slug = 'singlet');
update public.apparel_products set slug = 'track-pants'
  where slug = 'trackpants'
    and not exists (select 1 from public.apparel_products where slug = 'track-pants');
update public.apparel_products set slug = 'tee-shirt'
  where slug = 'training-tee'
    and not exists (select 1 from public.apparel_products where slug = 'tee-shirt');
update public.apparel_products set slug = 'playing-pants'
  where slug = 'playing-trousers'
    and not exists (select 1 from public.apparel_products where slug = 'playing-pants');
update public.apparel_products set slug = 'hoody'
  where slug = 'club-hoodie'
    and not exists (select 1 from public.apparel_products where slug = 'hoody');

-- 2) Upsert the 19 authoritative products.
insert into public.apparel_products
  (slug, name, description, price, sizes, image_url, image_alt, category, display_order, active, customisable, fulfilment_notes)
values
  -- Training Gear
  ('singlet', 'Singlet', 'NDCC maroon training singlet.', 31.00, '{}',
   '/images/cms/apparel/2026-27/singlet.webp',
   'Front and back views of the NDCC maroon training singlet.',
   'Training Gear', 10, true, false, null),
  ('track-pants', 'Track Pants', 'NDCC maroon track pants.', 44.00, '{}',
   '/images/cms/apparel/2026-27/track-pants.webp',
   'Multiple views of the NDCC maroon track pants.',
   'Training Gear', 20, true, false, null),
  ('tee-shirt', 'Tee Shirt', 'NDCC maroon training tee shirt.', 33.00, '{}',
   '/images/cms/apparel/2026-27/tee-shirt.webp',
   'Front and back views of the NDCC maroon training tee shirt.',
   'Training Gear', 30, true, false, null),
  ('shorts', 'Shorts', 'NDCC maroon training shorts.', 35.00, '{}',
   '/images/cms/apparel/2026-27/shorts.webp',
   'Multiple views of the NDCC maroon training shorts.',
   'Training Gear', 40, true, false, null),
  -- Playing Gear
  ('playing-shirt', 'Playing Shirt', 'NDCC playing shirt, available in maroon or crème.', 36.00, '{}',
   '/images/cms/apparel/2026-27/playing-shirt.webp',
   'Front and back views of the NDCC playing shirt in maroon and crème.',
   'Playing Gear', 50, true, false, null),
  ('playing-pants', 'Playing Pants', 'NDCC playing pants, available in maroon or crème.', 37.00, '{}',
   '/images/cms/apparel/2026-27/playing-pants.webp',
   'Multiple views of the NDCC playing pants in maroon and crème.',
   'Playing Gear', 60, true, false, null),
  ('jumper', 'Jumper', 'NDCC playing jumper, available in maroon or crème.', 49.00, '{}',
   '/images/cms/apparel/2026-27/jumper.webp',
   'Front and back views of the NDCC maroon playing jumper.',
   'Playing Gear', 70, true, false, null),
  ('reversible-vest', 'Reversible Vest', 'Reversible playing vest — maroon one side, crème the other.', 49.00, '{}',
   '/images/cms/apparel/2026-27/reversible-vest.webp',
   'Front and back views of the reversible NDCC maroon and crème playing vest.',
   'Playing Gear', 80, true, false, null),
  -- Accessories (all four await supplier product photography; kept inactive)
  ('wide-brim-hat', 'Wide Brim Hat', 'NDCC wide brim hat in maroon.', 27.00, '{}',
   '', 'Product image not supplied for the maroon wide brim hat.',
   'Accessories', 90, false, false,
   'Awaiting supplier product photography — do not publish until real artwork is supplied.'),
  ('baggy-cap', 'Baggy Cap', 'NDCC baggy cap.', 40.00, '{}',
   '', 'Product image not supplied for the NDCC baggy cap.',
   'Accessories', 100, false, false,
   'Awaiting supplier product photography — do not publish until real artwork is supplied.'),
  ('cap', 'Cap', 'NDCC cap.', 19.00, '{}',
   '', 'Product image not supplied for the NDCC cap.',
   'Accessories', 110, false, false,
   'Awaiting supplier product photography — do not publish until real artwork is supplied.'),
  ('bucket-hat', 'Bucket Hat', 'NDCC bucket hat.', 19.00, '{}',
   '', 'Product image not supplied for the NDCC bucket hat.',
   'Accessories', 120, false, false,
   'Awaiting supplier product photography — do not publish until real artwork is supplied.'),
  -- Fashion Gear
  ('club-polo', 'Club Polo', 'NDCC club polo.', 36.00, '{}',
   '/images/cms/apparel/2026-27/club-polo.webp',
   'Front and back views of the NDCC maroon club polo.',
   'Fashion Gear', 130, true, false, null),
  ('puffer-vest', 'Puffer Vest', 'NDCC maroon puffer vest.', 58.00, '{}',
   '/images/cms/apparel/2026-27/puffer-vest.webp',
   'Front and back views of the NDCC maroon puffer vest.',
   'Fashion Gear', 140, true, false, null),
  ('hoody', 'Hoody', 'NDCC maroon hoody.', 52.00, '{}',
   '/images/cms/apparel/2026-27/hoody.webp',
   'Front and back views of the NDCC maroon hoody.',
   'Fashion Gear', 150, true, false, null),
  ('puffer-jacket', 'Puffer Jacket', 'NDCC maroon puffer jacket.', 82.00, '{}',
   '/images/cms/apparel/2026-27/puffer-jacket.webp',
   'Front and back views of the NDCC maroon puffer jacket.',
   'Fashion Gear', 160, true, false, null),
  ('soft-shell-jacket', 'Soft Shell Jacket', 'NDCC maroon soft shell jacket.', 89.00, '{}',
   '/images/cms/apparel/2026-27/soft-shell-jacket.webp',
   'Front and back views of the NDCC maroon soft shell jacket.',
   'Fashion Gear', 170, true, false, null),
  ('sports-jacket', 'Sports Jacket', 'NDCC maroon sports jacket (lined track top). Also available with hood.', 60.00, '{}',
   '/images/cms/apparel/2026-27/sports-jacket.webp',
   'Front and back views of the NDCC maroon sports jacket.',
   'Fashion Gear', 180, true, false, null),
  ('bomber-jacket', 'Bomber Jacket', 'NDCC maroon bomber jacket.', 71.00, '{}',
   '/images/cms/apparel/2026-27/bomber-jacket.webp',
   'Front and back views of the NDCC maroon bomber jacket.',
   'Fashion Gear', 190, true, false, null)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  sizes = excluded.sizes,
  image_url = excluded.image_url,
  image_alt = excluded.image_alt,
  category = excluded.category,
  display_order = excluded.display_order,
  active = excluded.active,
  fulfilment_notes = coalesce(excluded.fulfilment_notes, public.apparel_products.fulfilment_notes),
  updated_at = now();
  -- customisable deliberately NOT overwritten: playing-shirt keeps its
  -- verified name/number personalisation flag.

-- 3) Archive legacy/duplicate/unmatched rows. Never deleted.
update public.apparel_products
set active = false, updated_at = now()
where slug in (
  'one-day-polo', 'one-day-ls-polo', 'one-day-pants', 'one-day-jumper',
  'two-day-polo', 'two-day-ls-polo', 'two-day-jumper', 'two-day-pants',
  'social-polo', 'sublimated-hoodie', 'club-cap', 'cricket-socks'
);

-- 4) Option seeds (single-choice per group; is_default marks the
--    zero-surcharge baseline).
insert into public.apparel_product_options
  (product_id, option_group, option_value, option_label, price_delta, is_default, display_order)
select p.id, o.option_group, o.option_value, o.option_label, o.price_delta, o.is_default, o.display_order
from (values
  -- Tee Shirt: long sleeve +$1.00
  ('tee-shirt', 'Sleeve length', 'short-sleeve', 'Short sleeve', 0.00, true, 1),
  ('tee-shirt', 'Sleeve length', 'long-sleeve', 'Long sleeve', 1.00, false, 2),
  -- Playing Shirt: colour, long sleeve +$1.00
  ('playing-shirt', 'Colour', 'maroon', 'Maroon', 0.00, true, 1),
  ('playing-shirt', 'Colour', 'creme', 'Crème', 0.00, false, 2),
  ('playing-shirt', 'Sleeve length', 'short-sleeve', 'Short sleeve', 0.00, true, 1),
  ('playing-shirt', 'Sleeve length', 'long-sleeve', 'Long sleeve', 1.00, false, 2),
  -- Playing Pants: colour
  ('playing-pants', 'Colour', 'maroon', 'Maroon', 0.00, true, 1),
  ('playing-pants', 'Colour', 'creme', 'Crème', 0.00, false, 2),
  -- Jumper: colour
  ('jumper', 'Colour', 'maroon', 'Maroon', 0.00, true, 1),
  ('jumper', 'Colour', 'creme', 'Crème', 0.00, false, 2),
  -- Club Polo: long sleeve +$1.00
  ('club-polo', 'Sleeve length', 'short-sleeve', 'Short sleeve', 0.00, true, 1),
  ('club-polo', 'Sleeve length', 'long-sleeve', 'Long sleeve', 1.00, false, 2),
  -- Hoody: style and fabric are independent groups (both may be chosen);
  -- combination pricing rule is additive pending club confirmation.
  ('hoody', 'Style', 'pullover', 'Pullover', 0.00, true, 1),
  ('hoody', 'Style', 'zipped', 'Zipped', 1.00, false, 2),
  ('hoody', 'Fabric', 'standard', 'Standard', 0.00, true, 1),
  ('hoody', 'Fabric', 'fleece', 'Fleece', 1.00, false, 2),
  -- Sports Jacket: hood availability documented, no surcharge supplied.
  ('sports-jacket', 'Hood', 'no-hood', 'Standard', 0.00, true, 1),
  ('sports-jacket', 'Hood', 'with-hood', 'With hood', 0.00, false, 2)
) as o(product_slug, option_group, option_value, option_label, price_delta, is_default, display_order)
join public.apparel_products p on p.slug = o.product_slug
on conflict (product_id, option_group, option_value) do nothing;
