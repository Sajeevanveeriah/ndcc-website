-- 2026/27 limited edition apparel, sourced from the "2026/27 Limited Edition
-- Apparel" poster supplied by NDCC on 1 October 2026.
--
-- Poster prices: Rugby Jumper A$75, Dino Socks A$18, Beanies A$25 and
-- Personalised Backpack A$75. Product images are cropped from the poster
-- (scripts/generate-apparel-assets.mjs); poster pricing text is excluded and
-- prices are rendered from this catalogue.
--
-- The poster gives no sizes. Garments use the club's 2026/27 workbook size
-- range, socks use the S, M, L range of the previous club sock listing, and
-- the beanie and backpack are One Size. Committee can correct any of these in
-- Admin > Apparel without a migration.
--
-- The backpack is personalised with initials (the "XX" on the artwork, as
-- confirmed by NDCC); lib/apparel/personalisation.ts maps this slug to the
-- initials form instead of surname and number.
--
-- Additive and repeatable. Existing product-level Stripe configuration is
-- operational state and is preserved on conflict, as in the retail catalogue.

insert into public.apparel_products (
  slug, name, description, price, sizes, image_url, image_alt, category,
  display_order, order_guidance, size_guidance, active, customisable,
  payment_mode, payment_link_url, stripe_price_id, checkout_enabled,
  fulfilment_notes
)
values
  ('rugby-jumper', 'Rugby Jumper', 'Limited edition 2026/27 NDCC maroon rugby jumper with sky blue and gold stripes and a white collar.', 75.00,
   array['K10','K12','K14','K16','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'],
   '/images/cms/apparel/2026-27/rugby-jumper.webp',
   'Front and back views of the limited edition NDCC maroon rugby jumper with sky blue and gold stripes, a white collar and the club badge.',
   '2026/27 Limited Edition', 1, 'Limited edition 2026/27 apparel.', 'Choose from the 2026/27 club apparel size guide.', true, false,
   'manual_enquiry', null, null, false, null),
  ('dino-socks', 'Dino Socks', 'Limited edition 2026/27 white NDCC Dino socks with maroon bands.', 18.00,
   array['S','M','L'],
   '/images/cms/apparel/2026-27/dino-socks.webp',
   'Several views of the white NDCC Dino socks with maroon bands and the Dino logo.',
   '2026/27 Limited Edition', 2, 'Limited edition 2026/27 apparel.', null, true, false,
   'manual_enquiry', null, null, false, null),
  ('beanie', 'Beanie', 'Limited edition 2026/27 maroon DINOS pom-pom beanie.', 25.00,
   array['One Size'],
   '/images/cms/apparel/2026-27/beanie.webp',
   'Two views of the maroon DINOS pom-pom beanie with sky blue and gold stripes, one showing the club badge.',
   '2026/27 Limited Edition', 3, 'Limited edition 2026/27 apparel.', 'One Size.', true, false,
   'manual_enquiry', null, null, false, null),
  ('personalised-backpack', 'Personalised Backpack', 'Limited edition 2026/27 black NDCC backpack with the club badge, personalised with your initials.', 75.00,
   array['One Size'],
   '/images/cms/apparel/2026-27/personalised-backpack.webp',
   'Black backpack with the NDCC club badge and example initials shown as XX.',
   '2026/27 Limited Edition', 4, 'Limited edition 2026/27 apparel. Enter 1 to 3 initials; initials are subject to club confirmation.', 'One Size.', true, true,
   'manual_enquiry', null, null, false, 'The club must confirm the initials before the supplier order is placed.')
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
  fulfilment_notes = excluded.fulfilment_notes,
  updated_at = now();

notify pgrst, 'reload schema';
