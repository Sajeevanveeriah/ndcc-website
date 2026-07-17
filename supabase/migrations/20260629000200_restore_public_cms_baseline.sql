-- Restore the public CMS baseline without deleting or overwriting live edited content.
-- This migration is intentionally idempotent and limited to public website content.

INSERT INTO content_blocks (block_key, page_slug, section_label, title, body, image_url, cta_label, cta_url, is_active)
VALUES
  ('footer.acknowledgement', 'footer', 'Acknowledgement', NULL, 'Newcomb & District Cricket Club acknowledges the Wadawurrung people as the Traditional Custodians of the land on which we play, train, and gather. We pay our respects to Elders past and present.', '/images/Connection_Bri_Hayes_Rev1.jpg', NULL, NULL, TRUE),
  ('home.hero', 'home', 'Hero', 'Newcomb and District Cricket Club', 'Home of the Dinos cricket community.', NULL, 'Join the Club', '/join', TRUE),
  ('home.quicklinks', 'home', 'Quick links', 'Explore the Club', 'Everything you need to know about the Dinos.', NULL, NULL, NULL, TRUE),
  ('home.season_status', 'home', 'Season status', '2025/26 Season Complete', 'The 2025/26 season has concluded. The 2026/27 season begins October 2026. Pre-season training details will be announced on our Facebook page.', NULL, 'View 2025/26 Results on PlayHQ', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c', TRUE),
  ('home.sponsor_intro', 'home', 'Sponsor intro', 'Our Sponsors', 'Thanks to all local businesses and partners supporting NDCC.', NULL, NULL, NULL, TRUE),
  ('home.sponsorship', 'home', 'Sponsorship', 'Our Sponsors', 'Thanks to all local businesses and partners supporting NDCC.', NULL, NULL, NULL, TRUE),
  ('home.juniors', 'home', 'Juniors', 'Ready to join the Dinos?', 'Whether you’re a seasoned cricketer or picking up a bat for the first time, there is a place for you at NDCC.', NULL, NULL, NULL, TRUE),
  ('about.hero', 'about', 'Hero', 'About the Dinos', 'A proud community cricket club in Geelong, established in 1977.', NULL, NULL, NULL, TRUE),
  ('about.history', 'about', 'History', 'Our History', 'The Dinos have proudly represented Newcomb since 1977, built on generations of community involvement and cricket tradition.', '/images/Turf_Ground.jpg', NULL, NULL, TRUE),
  ('about.affiliation', 'about', 'Affiliation', 'GCA Affiliation', 'NDCC is a proud member of the Geelong Cricket Association, supporting senior and junior cricket pathways across Geelong.', NULL, NULL, NULL, TRUE),
  ('about.goodsports', 'about', 'Good Sports', 'Good Sports Level 3', 'NDCC is a proud Level 3 accredited Good Sports club, committed to a safer and healthier environment for members, families, and the wider community.', NULL, 'Good Sports Level 3 Accredited', NULL, TRUE),
  ('about.partnership', 'about', 'Partnership', 'Newcomb Power Football Club', 'The Dinos share facilities at Grinter Reserve and work collaboratively to support sport in the Newcomb and Moolap community.', NULL, NULL, NULL, TRUE),
  ('about.committee', 'about', 'Committee', 'Committee & Office Bearers', 'The people who keep the Dinos running behind the scenes.', NULL, NULL, NULL, TRUE),
  ('facilities.hero', 'facilities', 'Hero', 'Our Facilities', 'Home of the Dinos, Grinter Reserve offers turf and synthetic practice wickets, a match-day oval, and clubrooms for players, families, and the wider Newcomb community.', NULL, NULL, NULL, TRUE),
  ('facilities.intro', 'facilities', 'Intro', 'Grinter Reserve', 'The Dinos play and train at Grinter Reserve, Coppards Road, Newcomb VIC 3219. The ground features a well-maintained turf wicket square and outfield, with clubrooms, change rooms, and a canteen shared with the Newcomb Power Football & Netball Club as part of the Newcomb and District Sports Club precinct.', '/images/Turf_Ground.jpg', NULL, NULL, TRUE),
  ('facilities.training', 'facilities', 'Training', 'Training Facility', 'Pre-season and in-season training runs at the Peter ‘Skinny’ Harrison Training Facility, with four club turf practice lanes and three public synthetic lanes for players of all ages. The synthetic lanes are open to the community for practice all year round.', '/images/Turf.jpg', NULL, NULL, TRUE),
  ('facilities.features_intro', 'facilities', 'Features intro', 'Facility Features', 'Everything you need for a season of cricket: practice wickets, a match-day oval, clubrooms, and a canteen, all at Grinter Reserve.', NULL, NULL, NULL, TRUE),
  ('facilities.cta', 'facilities', 'CTA', 'Visit or Enquire', 'Want to visit Grinter Reserve, enquire about facility hire, or get involved with the Dinos? Get in touch and we will be happy to help.', NULL, 'Contact Us', '/contact', TRUE),
  ('fixtures.hero', 'fixtures', 'Hero', 'Fixtures & Results', 'Follow the Dinos throughout the season across all grades.', NULL, NULL, NULL, TRUE),
  ('fixtures.status', 'fixtures', 'Status', '2025/26 Season Complete', 'The 2025/26 GCA season has concluded. You can view full results, ladders, and match details from the completed season on PlayHQ. The 2026/27 season begins in October 2026. Pre-season training details will be announced on our Facebook page.', NULL, 'View 2025/26 Results on PlayHQ', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c', TRUE),
  ('fixtures.team_links', 'fixtures', 'Team links', 'Team Fixtures on PlayHQ', 'View fixtures, results, and ladders for each NDCC team on PlayHQ. Updated links for 2026/27 can be published from admin when the new season draw is released.', NULL, 'View on PlayHQ', NULL, TRUE)
ON CONFLICT (block_key) DO UPDATE SET
  title = COALESCE(NULLIF(content_blocks.title, ''), EXCLUDED.title),
  body = COALESCE(NULLIF(content_blocks.body, ''), EXCLUDED.body),
  image_url = COALESCE(NULLIF(content_blocks.image_url, ''), EXCLUDED.image_url),
  cta_label = COALESCE(NULLIF(content_blocks.cta_label, ''), EXCLUDED.cta_label),
  cta_url = COALESCE(NULLIF(content_blocks.cta_url, ''), EXCLUDED.cta_url),
  is_active = TRUE;

WITH seed_links (page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active) AS (
  VALUES
  ('site','footer_quick_links','Home','','/',NULL,NULL,FALSE,1,TRUE),('site','footer_quick_links','About','','/about',NULL,NULL,FALSE,2,TRUE),('site','footer_quick_links','Fixtures','','/fixtures',NULL,NULL,FALSE,3,TRUE),('site','footer_quick_links','Events','','/events',NULL,NULL,FALSE,4,TRUE),('site','footer_quick_links','Gallery','','/gallery',NULL,NULL,FALSE,5,TRUE),('site','footer_quick_links','Sponsors','','/sponsors',NULL,NULL,FALSE,6,TRUE),
  ('site','footer_get_involved','Join the Club','','/join',NULL,NULL,FALSE,1,TRUE),('site','footer_get_involved','Volunteer','','/volunteer',NULL,NULL,FALSE,2,TRUE),('site','footer_get_involved','Become a Sponsor','','/sponsors',NULL,NULL,FALSE,3,TRUE),('site','footer_get_involved','Merchandise','','/merchandise',NULL,NULL,FALSE,4,TRUE),
  ('site','footer_affiliations','Geelong Cricket Association','','https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c',NULL,NULL,TRUE,1,TRUE),('site','footer_affiliations','Cricket Victoria','','https://www.cricketvictoria.com.au',NULL,NULL,TRUE,2,TRUE),('site','footer_affiliations','PlayHQ','','https://www.playhq.com',NULL,NULL,TRUE,3,TRUE),
  ('fixtures','team_links','1st XI','GCA Grade 4','https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c/geelong-cricket-association-mens-competition-summer-202526/teams/newcomb-and-district-1sts/0f74d5e7',NULL,'GCA Grade 4',TRUE,1,TRUE),('fixtures','team_links','2nd XI','GCA Grade 4','https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c',NULL,'GCA Grade 4',TRUE,2,TRUE),('fixtures','team_links','3rd XI','GCA Hard Wicket','https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c',NULL,'GCA Hard Wicket',TRUE,3,TRUE),('fixtures','team_links','Senior Women','GCA E Grade East','https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c',NULL,'GCA E Grade East',TRUE,4,TRUE),('fixtures','team_links','Juniors','GCA Junior Competition','https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c',NULL,'GCA Junior Competition',TRUE,5,TRUE)
)
INSERT INTO page_link_cards (page_slug, section_key, title, description, href, icon, badge, is_external, sort_order, is_active)
SELECT * FROM seed_links seed
WHERE NOT EXISTS (SELECT 1 FROM page_link_cards existing WHERE existing.page_slug = seed.page_slug AND existing.section_key = seed.section_key AND existing.title = seed.title AND existing.href = seed.href);

INSERT INTO committee_members (name, role, sort_order, is_active)
VALUES ('John Elliott','President',1,TRUE),('Troy Whitworth','Vice President',2,TRUE),('Laura Hudson','Treasurer',3,TRUE),('Craig Hillgrove','Head Coach',4,TRUE),('Marcus Pearson','Junior Coordinator',5,TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO facility_features (title, description, icon_key, sort_order, is_active)
SELECT * FROM (VALUES
  ('3 Public Synthetic Lanes','Open to the community for practice all year round.','lanes',1,TRUE),
  ('4 Club Turf Lanes','High-quality turf practice wickets for club training sessions.','turf',2,TRUE),
  ('Clubrooms & Pavilion','Social facilities, change rooms, and a fully equipped canteen on match days.','clubrooms',3,TRUE),
  ('Oval & Outfield','Well-maintained turf wicket square and outfield at Grinter Reserve.','oval',4,TRUE)
) AS seed(title, description, icon_key, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM facility_features existing WHERE existing.title = seed.title);

INSERT INTO history_competitions (abbreviation, name)
VALUES ('BPCA','Bellarine Peninsula Cricket Association'),('GDCA','Geelong District Cricket Association'),('GCA','Geelong Cricket Association')
ON CONFLICT (abbreviation) DO UPDATE SET name = COALESCE(NULLIF(history_competitions.name, ''), EXCLUDED.name);

INSERT INTO history_lineage_entries (club_name, start_season, end_season, association_abbr, sort_order, is_active)
SELECT * FROM (VALUES
  ('Alcoa Cricket Club','1972/73','1974/75','BPCA',1,TRUE),('Point Henry Cricket Club','1975/76','1976/77','BPCA',2,TRUE),('Newcomb & District Cricket Club','1977/78','1989/90','BPCA',3,TRUE),('Newcomb & District Cricket Club','1990/91','1994/95','GDCA',4,TRUE),('Newcomb & District Cricket Club','1995/96','Present','GCA',5,TRUE)
) AS seed(club_name,start_season,end_season,association_abbr,sort_order,is_active)
WHERE NOT EXISTS (SELECT 1 FROM history_lineage_entries existing WHERE existing.club_name = seed.club_name AND existing.start_season = seed.start_season AND existing.end_season = seed.end_season);

NOTIFY pgrst, 'reload schema';
