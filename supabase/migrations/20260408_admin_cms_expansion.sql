-- Admin CMS expansion for site pages, facilities, history, and apparel metadata

CREATE TABLE IF NOT EXISTS page_link_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug TEXT NOT NULL,
  section_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  href TEXT NOT NULL,
  icon TEXT,
  badge TEXT,
  is_external BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_link_cards_page_section
  ON page_link_cards (page_slug, section_key, is_active, sort_order);

CREATE TABLE IF NOT EXISTS facility_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon_key TEXT NOT NULL DEFAULT 'feature',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facility_features_sort
  ON facility_features (is_active, sort_order);

CREATE TABLE IF NOT EXISTS history_lineage_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_name TEXT NOT NULL,
  start_season TEXT NOT NULL,
  end_season TEXT NOT NULL,
  association_abbr TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_lineage_sort
  ON history_lineage_entries (is_active, sort_order);

CREATE TABLE IF NOT EXISTS history_competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abbreviation TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS history_premierships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_label TEXT NOT NULL,
  season_label TEXT NOT NULL,
  competition_abbr TEXT NOT NULL,
  grade_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_premierships_sort
  ON history_premierships (is_active, team_label, sort_order);

ALTER TABLE apparel_products
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_guidance TEXT,
  ADD COLUMN IF NOT EXISTS size_guidance TEXT;

UPDATE apparel_products
SET display_order = ranked.position
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, name ASC) AS position
  FROM apparel_products
) ranked
WHERE apparel_products.id = ranked.id
  AND COALESCE(apparel_products.display_order, 0) = 0;

INSERT INTO history_competitions (abbreviation, name)
VALUES
  ('BPCA', 'Bellarine Peninsula Cricket Association'),
  ('GDCA', 'Geelong District Cricket Association'),
  ('GCA', 'Geelong Cricket Association')
ON CONFLICT (abbreviation) DO NOTHING;

INSERT INTO history_lineage_entries (club_name, start_season, end_season, association_abbr, sort_order, is_active)
VALUES
  ('Alcoa Cricket Club', '1972/73', '1974/75', 'BPCA', 1, TRUE),
  ('Point Henry Cricket Club', '1975/76', '1976/77', 'BPCA', 2, TRUE),
  ('Newcomb & District Cricket Club', '1977/78', '1989/90', 'BPCA', 3, TRUE),
  ('Newcomb & District Cricket Club', '1990/91', '1994/95', 'GDCA', 4, TRUE),
  ('Newcomb & District Cricket Club', '1995/96', 'Present', 'GCA', 5, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO history_premierships (team_label, season_label, competition_abbr, grade_label, sort_order, is_active)
VALUES
  ('1st XI', '1973/74', 'BPCA', 'B grade', 1, TRUE),
  ('1st XI', '1985/86', 'BPCA', 'A grade', 2, TRUE),
  ('1st XI', '1992/93', 'GDCA', 'One Day Knockout', 3, TRUE),
  ('1st XI', '1994/95', 'GDCA', 'A grade', 4, TRUE),
  ('1st XI', '2002/03', 'GCA', 'Div 2 1sts', 5, TRUE),
  ('1st XI', '2012/13', 'GCA', 'Div 2 1sts', 6, TRUE),
  ('1st XI', '2016/17', 'GCA', 'Div 2 1sts', 7, TRUE),
  ('1st XI', '2025/26', 'GCA', 'Div 4 1sts', 8, TRUE),
  ('2nd XI', '1981/82', 'BPCA', 'B grade', 20, TRUE),
  ('2nd XI', '1995/96', 'GCA', 'Div 2 2nds', 21, TRUE),
  ('2nd XI', '1996/97', 'GCA', 'Div 2 2nds', 22, TRUE),
  ('2nd XI', '1997/98', 'GCA', 'Div 2 2nds', 23, TRUE),
  ('4th XI', '1981/82', 'BPCA', 'D grade', 40, TRUE),
  ('4th XI', '1982/83', 'BPCA', 'D grade', 41, TRUE),
  ('4th XI', '1983/84', 'BPCA', 'D grade', 42, TRUE),
  ('4th XI', '1984/85', 'BPCA', 'D grade', 43, TRUE),
  ('4th XI', '2000/01', 'GCA', 'Div 2 4ths', 44, TRUE),
  ('4th XI', '2010/11', 'GCA', 'Div 2 4ths', 45, TRUE),
  ('5th XI', '1996/97', 'GCA', '6ths', 50, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO page_link_cards (page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active)
VALUES
  ('home', 'quick_links', 'About Us', 'Learn about our history and the people behind the club.', '/about', '🏏', NULL, FALSE, 1, TRUE),
  ('home', 'quick_links', 'Our Teams', 'Senior Men, Senior Women, and Junior Boys squads.', '/teams', '👥', NULL, FALSE, 2, TRUE),
  ('home', 'quick_links', 'Events', 'Upcoming social events, fundraisers, and match days.', '/events', '📅', NULL, FALSE, 3, TRUE),
  ('home', 'quick_links', 'Merchandise', 'Get your official NDCC gear and support the club.', '/merchandise', '🛒', NULL, FALSE, 4, TRUE),
  ('home', 'quick_links', 'Volunteer', 'Help out on match days - canteen, scoring, and more.', '/volunteer', '🤝', NULL, FALSE, 5, TRUE),
  ('home', 'quick_links', 'Contact', 'Get in touch with the club or make an enquiry.', '/contact', '✉️', NULL, FALSE, 6, TRUE),
  ('fixtures', 'team_links', '1st XI', 'GCA Grade 4', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c/geelong-cricket-association-mens-competition-summer-202526/teams/newcomb-and-district-1sts/0f74d5e7', NULL, 'GCA Grade 4', TRUE, 1, TRUE),
  ('fixtures', 'team_links', '2nd XI', 'GCA Grade 4', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c', NULL, 'GCA Grade 4', TRUE, 2, TRUE),
  ('fixtures', 'team_links', '3rd XI', 'GCA Hard Wicket', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c', NULL, 'GCA Hard Wicket', TRUE, 3, TRUE),
  ('fixtures', 'team_links', 'Senior Women', 'GCA E Grade East', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c', NULL, 'GCA E Grade East', TRUE, 4, TRUE),
  ('fixtures', 'team_links', 'Juniors', 'GCA Junior Competition', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c', NULL, 'GCA Junior Competition', TRUE, 5, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO facility_features (title, description, icon_key, sort_order, is_active)
VALUES
  ('3 Public Synthetic Lanes', 'Open to the community for practice all year round.', 'lanes', 1, TRUE),
  ('4 Club Turf Lanes', 'High-quality turf practice wickets for club training sessions.', 'turf', 2, TRUE),
  ('Clubrooms & Pavilion', 'Social facilities, change rooms, and a fully equipped canteen on match days.', 'clubrooms', 3, TRUE),
  ('Oval & Outfield', 'Well-maintained turf wicket square and outfield at Grinter Reserve.', 'oval', 4, TRUE),
  ('Parking', 'Ample on-site parking for players, officials, and spectators.', 'parking', 5, TRUE),
  ('Accessible', 'Accessible facilities for players and spectators of all abilities.', 'accessible', 6, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO content_blocks (block_key, page_slug, section_label, title, body, image_url, cta_label, cta_url, is_active)
VALUES
  ('home.season_status', 'home', 'Season status', '2025/26 Season Complete', 'The 2025/26 season has concluded. The 2026/27 season begins October 2026. Pre-season training details will be announced on our Facebook page.', NULL, 'View 2025/26 Results on PlayHQ', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c', TRUE),
  ('about.hero', 'about', 'Hero', 'About the Dinos', 'A proud community cricket club in Geelong, established in 1972.', NULL, NULL, NULL, TRUE),
  ('about.affiliation', 'about', 'Affiliation', 'GCA Affiliation', 'NDCC is a proud member of the Geelong Cricket Association (GCA), one of the premier cricket associations in regional Victoria. The GCA oversees competitions across a wide range of grades, providing pathways for players of all abilities.\n\nOur Senior Men compete in GCA Grade 4, while our Senior Women play in GCA E Grade East. Junior players participate in the GCA junior competition throughout the season.', NULL, NULL, NULL, TRUE),
  ('about.goodsports', 'about', 'Good Sports', 'Good Sports Level 3', 'NDCC is a proud Level 3 accredited Good Sports club. Good Sports is Australia''s largest health initiative in community sport, helping clubs create a safer and healthier environment for members, families, and the wider community.\n\nAs a Level 3 club, we demonstrate our commitment to responsible alcohol management, promoting healthy lifestyles, and ensuring our club is a welcoming place for everyone — especially young players and families.', NULL, 'Good Sports Level 3 Accredited', NULL, TRUE),
  ('about.partnership', 'about', 'Partnership', 'Newcomb Power Football Club', 'NDCC shares a strong partnership with the Newcomb Power Football Club. Together, we share facilities at Grinter Reserve and work collaboratively to support sport in the Newcomb and Moolap community.\n\nThis partnership allows us to provide better facilities, coordinate social events, and strengthen the community bond between our two clubs. Many of our members play for both clubs across the winter and summer seasons.', NULL, NULL, NULL, TRUE),
  ('about.committee', 'about', 'Committee intro', 'Committee & Office Bearers', 'The people who keep the Dinos running behind the scenes.', NULL, NULL, NULL, TRUE),
  ('facilities.hero', 'facilities', 'Hero', 'Our Facilities', 'Home ground, training nets, and community facilities at Grinter Reserve.', NULL, NULL, NULL, TRUE),
  ('facilities.intro', 'facilities', 'Ground intro', 'Grinter Reserve', 'Grinter Reserve is the proud home of the Dinos. Located in Moolap, just south of Geelong, the ground has been a hub for community cricket for decades.\n\nThe venue features a quality turf wicket square, well-maintained outfield, modern clubrooms and pavilion, and ample facilities for players, officials, and spectators alike.\n\nShared with the Newcomb Power Football Club, Grinter Reserve is a true multi-sport community facility serving the Newcomb and Moolap areas.', '/images/Turf_Ground.jpg', NULL, NULL, TRUE),
  ('facilities.training', 'facilities', 'Training section', 'Peter ‘’Skinny’’ Harrison Training Facility', 'Opened August 2024\n\nThe Peter ‘’Skinny’’ Harrison Training Facility is a state-of-the-art training venue named in honour of a beloved club legend. Officially opened in August 2024, the facility represents a major investment in the future of cricket at NDCC.\n\nThe facility features 3 public synthetic lanes available for community use, as well as 4 club turf lanes reserved for official NDCC training sessions.\n\nThese world-class nets provide our players with exceptional training surfaces and give the broader community access to quality cricket practice facilities.', '/images/Turf.jpg', NULL, NULL, TRUE),
  ('facilities.features_intro', 'facilities', 'Features intro', 'Facility Features', 'Everything our ground has to offer for players and visitors.', NULL, NULL, NULL, TRUE),
  ('facilities.cta', 'facilities', 'Facilities CTA', 'Visit or Enquire', 'Get in touch if you need details about access, training times, or facility use.', NULL, 'Contact Us', '/contact', TRUE),
  ('fixtures.hero', 'fixtures', 'Hero', 'Fixtures & Results', 'Follow the Dinos throughout the season across all grades.', NULL, NULL, NULL, TRUE),
  ('fixtures.status', 'fixtures', 'Season status', '2025/26 Season Complete', 'The 2025/26 GCA season has concluded. You can view full results, ladders, and match details from the completed season on PlayHQ. The 2026/27 season begins in October 2026. Pre-season training details will be announced on our Facebook page.', NULL, 'View 2025/26 Results on PlayHQ', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c', TRUE),
  ('fixtures.team_links', 'fixtures', 'Team links intro', 'Team Fixtures on PlayHQ', 'View fixtures, results, and ladders for each NDCC team on PlayHQ. Links below go to the 2025/26 season pages. Updated links for 2026/27 can be published from admin when the new season draw is released.', NULL, 'View on PlayHQ', NULL, TRUE),
  ('merch.hero', 'merchandise', 'Merchandise hero', 'Club Merchandise', 'Show your Dinos pride with official Newcomb and District Cricket Club gear. All merchandise is available for order online and collection from the club.', NULL, NULL, NULL, TRUE),
  ('merch.ordering', 'merchandise', 'Ordering help', 'Ordering Information', 'Use this section to provide ordering notes such as pickup windows, payment guidance, and sizing reminders.', NULL, NULL, NULL, TRUE)
ON CONFLICT (block_key) DO NOTHING;

UPDATE apparel_products
SET category = CASE slug
  WHEN 'playing-shirt' THEN 'One Day'
  WHEN 'playing-trousers' THEN 'One Day'
  WHEN 'club-hoodie' THEN 'Training'
  WHEN 'training-tee' THEN 'Training'
  WHEN 'club-polo' THEN 'Social'
  WHEN 'club-cap' THEN 'Accessories'
  WHEN 'training-singlet' THEN 'Training'
  WHEN 'cricket-socks' THEN 'Accessories'
  ELSE category
END
WHERE category = 'General';

INSERT INTO apparel_products (slug, name, description, price, sizes, image_url, customisable, category, display_order, order_guidance, size_guidance, active)
VALUES
  ('puffer-jacket', 'Puffer Jacket', '', 0, ARRAY[]::TEXT[], '', FALSE, 'Outerwear', 1, NULL, NULL, TRUE),
  ('soft-shell-jacket', 'Soft Shell Jacket', '', 0, ARRAY[]::TEXT[], '', FALSE, 'Outerwear', 2, NULL, NULL, TRUE),
  ('puffer-vest', 'Puffer Vest', '', 0, ARRAY[]::TEXT[], '', FALSE, 'Outerwear', 3, NULL, NULL, TRUE),
  ('two-day-polo', 'One Day Polo', '', 0, ARRAY[]::TEXT[], '', FALSE, 'One Day', 4, NULL, NULL, TRUE),
  ('two-day-ls-polo', 'One Day LS Polo', '', 0, ARRAY[]::TEXT[], '', FALSE, 'One Day', 5, NULL, NULL, TRUE),
  ('two-day-jumper', 'One Day Jumper', '', 0, ARRAY[]::TEXT[], '', FALSE, 'One Day', 6, NULL, NULL, TRUE),
  ('two-day-pants', 'One Day Pants', '', 0, ARRAY[]::TEXT[], '', FALSE, 'One Day', 7, NULL, NULL, TRUE),
  ('one-day-polo', 'One Day Polo', '', 0, ARRAY[]::TEXT[], '', FALSE, 'One Day', 8, NULL, NULL, TRUE),
  ('one-day-ls-polo', 'One Day LS Polo', '', 0, ARRAY[]::TEXT[], '', FALSE, 'One Day', 9, NULL, NULL, TRUE),
  ('one-day-pants', 'One Day Pants', '', 0, ARRAY[]::TEXT[], '', FALSE, 'One Day', 10, NULL, NULL, TRUE),
  ('one-day-jumper', 'One Day Jumper', '', 0, ARRAY[]::TEXT[], '', FALSE, 'One Day', 11, NULL, NULL, TRUE),
  ('sports-jacket', 'Sports Jacket', '', 0, ARRAY[]::TEXT[], '', FALSE, 'Outerwear', 12, NULL, NULL, TRUE),
  ('reversible-vest', 'Reversible Vest', '', 0, ARRAY[]::TEXT[], '', FALSE, 'Outerwear', 13, NULL, NULL, TRUE),
  ('sublimated-hoodie', 'Sublimated Hoodie', '', 0, ARRAY[]::TEXT[], '', FALSE, 'Training', 14, NULL, NULL, TRUE),
  ('social-polo', 'Social Polo', '', 0, ARRAY[]::TEXT[], '', FALSE, 'Social', 15, NULL, NULL, TRUE),
  ('shorts', 'Shorts', '', 0, ARRAY[]::TEXT[], '', FALSE, 'Training', 16, NULL, NULL, TRUE),
  ('cap', 'Cap', '', 0, ARRAY[]::TEXT[], '', FALSE, 'Accessories', 17, NULL, NULL, TRUE),
  ('trackpants', 'Trackpants', '', 0, ARRAY[]::TEXT[], '', FALSE, 'Training', 18, NULL, NULL, TRUE)
ON CONFLICT (slug) DO NOTHING;

UPDATE apparel_products
SET display_order = CASE slug
  WHEN 'playing-shirt' THEN 101
  WHEN 'playing-trousers' THEN 102
  WHEN 'club-hoodie' THEN 103
  WHEN 'training-tee' THEN 104
  WHEN 'club-polo' THEN 105
  WHEN 'club-cap' THEN 106
  WHEN 'training-singlet' THEN 107
  WHEN 'cricket-socks' THEN 108
  ELSE display_order
END;

NOTIFY pgrst, 'reload schema';
