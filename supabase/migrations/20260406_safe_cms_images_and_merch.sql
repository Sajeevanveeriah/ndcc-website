-- Safe CMS image-field extensions + merch product backfill
-- Scope: news image URLs, kitchen item image URLs, and missing apparel seed products.

ALTER TABLE news
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE kitchen_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Backfill missing apparel products from the existing static/default catalog.
-- Duplicate prevention: slug is UNIQUE on apparel_products, and ON CONFLICT DO NOTHING
-- only inserts rows that do not already exist.
INSERT INTO apparel_products (slug, name, description, price, sizes, image_url, customisable, active)
VALUES
  ('playing-shirt', 'Playing Shirt (White)', 'Official NDCC playing shirt in white with embroidered club crest. Match-day ready with a professional fit. Available with custom name and number.', 65, ARRAY['XS','S','M','L','XL','2XL','3XL'], '', TRUE, TRUE),
  ('playing-trousers', 'Playing Trousers (White)', 'Official NDCC playing trousers in white. Comfortable and durable for all-day cricket.', 55, ARRAY['XS','S','M','L','XL','2XL','3XL'], '', FALSE, TRUE),
  ('club-hoodie', 'Club Hoodie (Maroon)', 'Warm maroon hoodie with embroidered club crest. Perfect for cool training evenings and winter off-season.', 70, ARRAY['XS','S','M','L','XL','2XL','3XL'], '', FALSE, TRUE),
  ('training-tee', 'Training Tee (Maroon)', 'Lightweight maroon training tee with printed club logo. Breathable performance fabric for nets and fitness sessions.', 40, ARRAY['XS','S','M','L','XL','2XL','3XL'], '', FALSE, TRUE),
  ('club-polo', 'Club Polo (Maroon)', 'Official NDCC polo shirt in maroon with embroidered club crest. Perfect for match days, training, and club events.', 45, ARRAY['XS','S','M','L','XL','2XL','3XL'], '', FALSE, TRUE),
  ('club-cap', 'Club Cap (Maroon)', 'Maroon club cap with embroidered Dinos logo. Adjustable strap for a comfortable fit.', 25, ARRAY['One Size'], '', FALSE, TRUE),
  ('training-singlet', 'Training Singlet (Maroon)', 'Lightweight maroon training singlet with printed club logo. Breathable fabric for summer training sessions.', 35, ARRAY['XS','S','M','L','XL','2XL'], '', FALSE, TRUE),
  ('cricket-socks', 'Cricket Socks (Maroon/White)', 'NDCC cricket socks in maroon and white. Cushioned sole for comfort during long days in the field.', 15, ARRAY['S','M','L'], '', FALSE, TRUE)
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
