-- Seed the existing 2026/27 signing cards that were previously rendered from static assets.
-- Duplicate-safe by name so this can be applied after partial manual data entry without creating duplicate cards.

WITH seed_appointments (name, role, image_url, announcement_date, sort_order, is_active) AS (
  VALUES
    ('Aaron Morgan', '', '/images/season-appointments/2026-27/aaron-morgan-re-signed-2026-27.webp', DATE '2026-05-01', 3, TRUE),
    ('Anthony Quarrell', '', '/images/season-appointments/2026-27/anthony-quarrell-re-signed-2026-27.webp', DATE '2026-05-02', 4, TRUE),
    ('Blake Ritchie', '', '/images/season-appointments/2026-27/blake-ritchie-re-signed-2026-27.webp', DATE '2026-05-03', 5, TRUE),
    ('Craig Hillgrove', 'Head Coach', '/images/season-appointments/2026-27/craig-hillgrove-head-coach-2026-27.webp', DATE '2026-03-01', 1, TRUE),
    ('Freddie Norridge', '', '/images/season-appointments/2026-27/freddie-norridge-signed-2026-27.webp', DATE '2026-05-04', 6, TRUE),
    ('Huey Neild', '', '/images/season-appointments/2026-27/huey-neild-re-signed-2026-27.webp', DATE '2026-05-05', 7, TRUE),
    ('Kelsey Allan', 'Women''s Coach', '/images/season-appointments/2026-27/kelsey-allan-womens-coach-2026-27.webp', DATE '2026-03-15', 2, TRUE),
    ('Nathan Keevil', '', '/images/season-appointments/2026-27/nathan-keevil-re-signed-2026-27.webp', DATE '2026-05-06', 8, TRUE),
    ('Scott Kirby', '', '/images/season-appointments/2026-27/scott-kirby-re-signed-2026-27.webp', DATE '2026-05-07', 9, TRUE)
), updated_existing AS (
  UPDATE season_appointments AS existing
  SET
    image_url = CASE
      WHEN existing.image_url IS NULL OR btrim(existing.image_url) = '' THEN seed_appointments.image_url
      WHEN existing.image_url IN ('/images/Craig_Hillgrove.png', '/images/Kelsey_Allan.png') THEN seed_appointments.image_url
      ELSE existing.image_url
    END,
    sort_order = CASE
      WHEN existing.sort_order = 0 THEN seed_appointments.sort_order
      ELSE existing.sort_order
    END,
    is_active = TRUE
  FROM seed_appointments
  WHERE lower(btrim(existing.name)) = lower(seed_appointments.name)
  RETURNING existing.id
)
INSERT INTO season_appointments (name, role, image_url, announcement_date, sort_order, is_active)
SELECT seed_appointments.name, seed_appointments.role, seed_appointments.image_url, seed_appointments.announcement_date, seed_appointments.sort_order, seed_appointments.is_active
FROM seed_appointments
WHERE NOT EXISTS (
  SELECT 1
  FROM season_appointments existing
  WHERE lower(btrim(existing.name)) = lower(seed_appointments.name)
);

NOTIFY pgrst, 'reload schema';
