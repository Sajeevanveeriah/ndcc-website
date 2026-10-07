-- The personalised backpack can now carry a number (1 to 3 digits) instead of
-- initials; lib/apparel/personalisation.ts accepts either in custom_initials.
--
-- Copy-only update. Each column is changed only while it still holds the text
-- from 20261001040000_apparel_limited_edition_2026_27.sql, so any wording the
-- committee has edited in Admin > Apparel is preserved. Repeatable.

update public.apparel_products
set description = 'Limited edition 2026/27 black NDCC backpack with the club badge, personalised with your initials or a number.'
where slug = 'personalised-backpack'
  and description = 'Limited edition 2026/27 black NDCC backpack with the club badge, personalised with your initials.';

update public.apparel_products
set order_guidance = 'Limited edition 2026/27 apparel. Enter 1 to 3 initials or a number of 1 to 3 digits; personalisation is subject to club confirmation.'
where slug = 'personalised-backpack'
  and order_guidance = 'Limited edition 2026/27 apparel. Enter 1 to 3 initials; initials are subject to club confirmation.';

update public.apparel_products
set fulfilment_notes = 'The club must confirm the initials or number before the supplier order is placed.'
where slug = 'personalised-backpack'
  and fulfilment_notes = 'The club must confirm the initials before the supplier order is placed.';
