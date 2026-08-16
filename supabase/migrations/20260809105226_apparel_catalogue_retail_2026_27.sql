-- 2026/27 retail apparel catalogue, sourced from the 9 August 2026 club
-- apparel price list and master workbook supplied by NDCC.
--
-- This migration is additive and repeatable. Historical product rows and
-- option rows are retained but made inactive. Existing order JSON remains
-- unchanged, so prior order history keeps its original labels and prices.
--
-- Size source: the complete label set printed in the supplied workbook:
-- K10, K12, K14, K16, XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL.
-- Headwear is explicitly One Size.
--
-- The workbook contains cap artwork. Neither supplied file contains product
-- artwork for Wide Brim Hat or Baggy Cap, so those two products remain
-- inactive until approved artwork is supplied. No placeholder is published.

insert into public.apparel_products (
  slug, name, description, price, sizes, image_url, image_alt, category,
  display_order, order_guidance, size_guidance, active, customisable,
  payment_mode, payment_link_url, stripe_price_id, checkout_enabled,
  fulfilment_notes
)
values
  -- Training Gear
  ('singlet', 'Singlet', 'NDCC maroon training singlet. A women''s razor back fit is available.', 40.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/singlet.webp',
   'Front and back views of the NDCC maroon training singlet, including the women''s razor back fit.',
   'Training Gear', 10, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('track-pants', 'Track Pants', 'NDCC maroon track pants.', 55.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/track-pants.webp',
   'Multiple views of the NDCC maroon track pants.',
   'Training Gear', 20, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('tee-shirt', 'Tee Shirt', 'NDCC maroon training tee shirt. Long sleeves are available for an additional A$6.', 44.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/tee-shirt.webp',
   'Front and back views of the NDCC maroon training tee shirt.',
   'Training Gear', 30, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('shorts', 'Shorts', 'NDCC maroon training shorts.', 42.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/shorts.webp',
   'Multiple views of the NDCC maroon training shorts.',
   'Training Gear', 40, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),

  -- Playing Gear. Personalisation is available only where the workbook has
  -- both NAME and NUMBER order columns.
  ('playing-shirt', 'Playing Shirt', 'NDCC playing shirt, available in maroon or crème. Long sleeves are available for an additional A$6.', 45.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/playing-shirt.webp',
   'Front views of the NDCC playing shirt in maroon and crème.',
   'Playing Gear', 50, 'Surname only. Provide up to two different number preferences from 1 to 99. All requests are subject to availability and club confirmation.',
   'Choose from the supplied 2026/27 workbook size guide.', true, true,
   'manual_enquiry', null, null, false, 'The club must confirm the final number before the supplier order is placed.'),
  ('playing-pants', 'Playing Pants', 'NDCC playing pants, available in maroon or crème.', 55.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/playing-pants.webp',
   'Multiple views of the NDCC playing pants in maroon and crème.',
   'Playing Gear', 60, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('jumper', 'Jumper', 'NDCC playing jumper, available in maroon or crème.', 75.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/jumper.webp',
   'Front view of the maroon NDCC playing jumper.',
   'Playing Gear', 70, 'Surname only. Provide up to two different number preferences from 1 to 99. All requests are subject to availability and club confirmation.',
   'Choose from the supplied 2026/27 workbook size guide.', true, true,
   'manual_enquiry', null, null, false, 'The club must confirm the final number before the supplier order is placed.'),
  ('reversible-jumper', 'Reversible Jumper', 'Reversible NDCC playing jumper in maroon and crème.', 90.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/reversible-jumper.webp',
   'Front artwork for the maroon and crème sides of the reversible NDCC playing jumper.',
   'Playing Gear', 80, 'Surname only. Provide up to two different number preferences from 1 to 99. All requests are subject to availability and club confirmation.',
   'Choose from the supplied 2026/27 workbook size guide.', true, true,
   'manual_enquiry', null, null, false, 'The club must confirm the final number before the supplier order is placed.'),
  ('vest', 'Vest', 'NDCC playing vest, available in maroon or crème.', 65.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/vest.webp',
   'Front views of the NDCC playing vest in maroon and crème.',
   'Playing Gear', 90, 'Surname only. Provide up to two different number preferences from 1 to 99. All requests are subject to availability and club confirmation.',
   'Choose from the supplied 2026/27 workbook size guide.', true, true,
   'manual_enquiry', null, null, false, 'The club must confirm the final number before the supplier order is placed.'),
  ('reversible-vest', 'Reversible Vest', 'Reversible NDCC playing vest in maroon and crème.', 85.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/reversible-vest.webp',
   'Front artwork for the maroon and crème sides of the reversible NDCC playing vest.',
   'Playing Gear', 100, 'Surname only. Provide up to two different number preferences from 1 to 99. All requests are subject to availability and club confirmation.',
   'Choose from the supplied 2026/27 workbook size guide.', true, true,
   'manual_enquiry', null, null, false, 'The club must confirm the final number before the supplier order is placed.'),

  -- Headwear
  ('wide-brim-hat', 'Wide Brim Hat', 'NDCC wide brim hat in maroon.', 45.00,
   array['One Size'], '', 'Product image unavailable for the maroon NDCC wide brim hat.',
   'Headwear', 110, null, 'One Size.', false, false,
   'manual_enquiry', null, null, false, null),
  ('baggy-cap', 'Baggy Cap', 'NDCC baggy cap.', 45.00,
   array['One Size'], '', 'Product image unavailable for the NDCC baggy cap.',
   'Headwear', 120, null, 'One Size.', false, false,
   'manual_enquiry', null, null, false, null),
  ('cap', 'Cap', 'NDCC maroon cap.', 25.00,
   array['One Size'], '/images/cms/apparel/2026-27/cap.webp',
   'NDCC maroon cap shown from the side.',
   'Headwear', 130, null, 'One Size.', true, false,
   'manual_enquiry', null, null, false, null),

  -- Club and Outerwear
  ('club-polo', 'Club Polo', 'NDCC maroon club polo. Long sleeves are available for an additional A$6.', 45.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/club-polo.webp',
   'Front and back views of the NDCC maroon club polo.',
   'Club and Outerwear', 140, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('puffer-vest', 'Puffer Vest', 'NDCC maroon puffer vest.', 85.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/puffer-vest.webp',
   'Front and back views of the NDCC maroon puffer vest.',
   'Club and Outerwear', 150, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('hoody', 'Hoody', 'NDCC maroon hoody.', 65.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/hoody.webp',
   'Front and back views of the NDCC maroon hoody.',
   'Club and Outerwear', 160, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('puffer-jacket', 'Puffer Jacket', 'NDCC maroon puffer jacket.', 130.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/puffer-jacket.webp',
   'Front and back views of the NDCC maroon puffer jacket.',
   'Club and Outerwear', 170, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('soft-shell-jacket', 'Soft Shell Jacket', 'NDCC maroon soft shell jacket.', 90.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/soft-shell-jacket.webp',
   'Front and back views of the NDCC maroon soft shell jacket.',
   'Club and Outerwear', 180, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('spray-jacket', 'Spray Jacket', 'NDCC maroon spray jacket with a lined track-top construction.', 75.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/spray-jacket.webp',
   'Front and back views of the lined NDCC maroon spray jacket.',
   'Club and Outerwear', 190, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('summit-hoodie', 'Summit Hoodie', 'NDCC maroon Summit hoodie.', 65.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/summit-hoodie.webp',
   'Front and back views of the NDCC maroon Summit hoodie.',
   'Club and Outerwear', 200, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('boss-top-fleece', 'Boss Top Fleece', 'NDCC maroon Boss Top fleece.', 60.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/boss-top-fleece.webp',
   'Front and back views of the NDCC maroon Boss Top fleece.',
   'Club and Outerwear', 210, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('retro-jacket', 'Retro Jacket', 'NDCC maroon and crème retro jacket.', 110.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/retro-jacket.webp',
   'Front and back views of the NDCC maroon and crème retro jacket.',
   'Club and Outerwear', 220, null, 'Choose from the supplied 2026/27 workbook size guide.', true, false,
   'manual_enquiry', null, null, false, null)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  sizes = excluded.sizes,
  image_url = excluded.image_url,
  image_alt = excluded.image_alt,
  category = excluded.category,
  display_order = excluded.display_order,
  order_guidance = excluded.order_guidance,
  size_guidance = excluded.size_guidance,
  active = excluded.active,
  customisable = excluded.customisable,
  -- Existing product-level Stripe configuration is operational state, not
  -- catalogue content. Preserve it on conflict; only new rows receive the
  -- safe values declared above.
  fulfilment_notes = excluded.fulfilment_notes,
  updated_at = now();

-- Archive prior catalogue entries. No row is deleted.
update public.apparel_products
set active = false, updated_at = now()
where slug in (
  'one-day-polo', 'one-day-ls-polo', 'one-day-pants', 'one-day-jumper',
  'two-day-polo', 'two-day-ls-polo', 'two-day-jumper', 'two-day-pants',
  'social-polo', 'sublimated-hoodie', 'club-cap', 'cricket-socks',
  'bucket-hat', 'sports-jacket', 'bomber-jacket'
);

-- Retain historical option rows, but expose only the current documented set.
update public.apparel_product_options
set active = false, updated_at = now()
where product_id in (
  select id from public.apparel_products where slug in (
    'singlet', 'track-pants', 'tee-shirt', 'shorts', 'playing-shirt',
    'playing-pants', 'jumper', 'reversible-jumper', 'vest',
    'reversible-vest', 'wide-brim-hat', 'baggy-cap', 'cap', 'club-polo',
    'puffer-vest', 'hoody', 'puffer-jacket', 'soft-shell-jacket',
    'spray-jacket', 'summit-hoodie', 'boss-top-fleece', 'retro-jacket',
    'one-day-polo', 'one-day-ls-polo', 'one-day-pants', 'one-day-jumper',
    'two-day-polo', 'two-day-ls-polo', 'two-day-jumper', 'two-day-pants',
    'social-polo', 'sublimated-hoodie', 'club-cap', 'cricket-socks',
    'bucket-hat', 'sports-jacket', 'bomber-jacket'
  )
);

insert into public.apparel_product_options (
  product_id, option_group, option_value, option_label, price_delta,
  is_default, active, display_order
)
select p.id, o.option_group, o.option_value, o.option_label, o.price_delta,
       o.is_default, true, o.display_order
from (values
  ('singlet', 'Fit', 'unisex', 'Unisex', 0.00, true, 1),
  ('singlet', 'Fit', 'womens-razor-back', 'Women''s razor back', 0.00, false, 2),
  ('tee-shirt', 'Sleeve length', 'short-sleeve', 'Short sleeve', 0.00, true, 1),
  ('tee-shirt', 'Sleeve length', 'long-sleeve', 'Long sleeve', 6.00, false, 2),
  ('playing-shirt', 'Colour', 'maroon', 'Maroon', 0.00, true, 1),
  ('playing-shirt', 'Colour', 'creme', 'Crème', 0.00, false, 2),
  ('playing-shirt', 'Sleeve length', 'short-sleeve', 'Short sleeve', 0.00, true, 1),
  ('playing-shirt', 'Sleeve length', 'long-sleeve', 'Long sleeve', 6.00, false, 2),
  ('playing-pants', 'Colour', 'maroon', 'Maroon', 0.00, true, 1),
  ('playing-pants', 'Colour', 'creme', 'Crème', 0.00, false, 2),
  ('jumper', 'Colour', 'maroon', 'Maroon', 0.00, true, 1),
  ('jumper', 'Colour', 'creme', 'Crème', 0.00, false, 2),
  ('vest', 'Colour', 'maroon', 'Maroon', 0.00, true, 1),
  ('vest', 'Colour', 'creme', 'Crème', 0.00, false, 2),
  ('club-polo', 'Sleeve length', 'short-sleeve', 'Short sleeve', 0.00, true, 1),
  ('club-polo', 'Sleeve length', 'long-sleeve', 'Long sleeve', 6.00, false, 2)
) as o(product_slug, option_group, option_value, option_label, price_delta, is_default, display_order)
join public.apparel_products p on p.slug = o.product_slug
on conflict (product_id, option_group, option_value) do update set
  option_label = excluded.option_label,
  price_delta = excluded.price_delta,
  is_default = excluded.is_default,
  active = true,
  display_order = excluded.display_order,
  updated_at = now();

-- Public option reads must also require a visible parent product. This closes
-- the prior leak where active options remained readable for archived products.
drop policy if exists apparel_product_options_public_read_active
  on public.apparel_product_options;
create policy apparel_product_options_public_read_active
  on public.apparel_product_options
  for select to anon, authenticated
  using (
    active = true
    and exists (
      select 1 from public.apparel_products product
      where product.id = apparel_product_options.product_id
        and product.active = true
    )
  );

notify pgrst, 'reload schema';
