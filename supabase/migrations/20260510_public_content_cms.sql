-- Move public hardcoded site content into CMS-managed structured tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  field_type TEXT NOT NULL DEFAULT 'text',
  group_label TEXT NOT NULL DEFAULT 'Site Settings',
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS navigation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  group_label TEXT NOT NULL DEFAULT 'main',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (href, group_label)
);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  captain TEXT,
  playhq_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS sponsor_tiers (
  value TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enquiry_types (
  value TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  href TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (href)
);

CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  season_label TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (image_url)
);

CREATE OR REPLACE FUNCTION set_public_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['site_settings','navigation_links','teams','sponsor_tiers','enquiry_types','public_downloads','achievements'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_public_content_updated_at()', table_name, table_name);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_navigation_links_public ON navigation_links (group_label, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_teams_public ON teams (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_public_downloads_public ON public_downloads (category, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_achievements_public ON achievements (is_active, sort_order);

INSERT INTO site_settings (key, label, value, field_type, group_label, sort_order, is_public)
VALUES
  ('club_name', 'Club name', 'Newcomb and District Cricket Club', 'text', 'Club profile', 1, TRUE),
  ('club_short', 'Short name', 'NDCC', 'text', 'Club profile', 2, TRUE),
  ('club_nickname', 'Nickname', 'Dinos', 'text', 'Club profile', 3, TRUE),
  ('club_established', 'Established year', '1972', 'text', 'Club profile', 4, TRUE),
  ('club_email', 'Club email', 'ndsc.cricket@gmail.com', 'email', 'Contact details', 10, TRUE),
  ('club_phone', 'Club phone', '0419 236 866', 'text', 'Contact details', 11, TRUE),
  ('club_ground', 'Home ground', 'Grinter Reserve', 'text', 'Contact details', 12, TRUE),
  ('club_address', 'Ground address', '141 Coppards Road, Moolap VIC 3224', 'text', 'Contact details', 13, TRUE),
  ('club_association', 'Association', 'Geelong Cricket Association', 'text', 'Club profile', 20, TRUE),
  ('club_association_short', 'Association short name', 'GCA', 'text', 'Club profile', 21, TRUE),
  ('acknowledgement', 'Acknowledgement of Country', 'Newcomb and District Cricket Club acknowledges the Wadawurrung people as the traditional custodians of the land on which we play and train. We pay our respects to Elders past, present, and emerging.', 'textarea', 'Footer', 30, TRUE),
  ('google_maps_embed_url', 'Google Maps embed URL', 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3140.5!2d144.38!3d-38.17!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sGrinter+Reserve+Moolap!5e0!3m2!1sen!2sau!4v1234567890', 'url', 'Contact details', 40, TRUE),
  ('facebook_url', 'Facebook URL', 'https://www.facebook.com/NewcombDistrictCricketClub/', 'url', 'Social links', 50, TRUE),
  ('instagram_url', 'Instagram URL', 'https://www.instagram.com/newcombdistrictcc/', 'url', 'Social links', 51, TRUE),
  ('instagram_handle', 'Instagram handle', '@newcombdistrictcc', 'text', 'Social links', 52, TRUE),
  ('playhq_org_url', 'PlayHQ club URL', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c', 'url', 'External links', 60, TRUE)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, field_type = EXCLUDED.field_type, group_label = EXCLUDED.group_label, sort_order = EXCLUDED.sort_order;

INSERT INTO navigation_links (label, href, group_label, sort_order, is_active)
VALUES
  ('Home', '/', 'main', 1, TRUE), ('About', '/about', 'main', 2, TRUE), ('Teams', '/teams', 'main', 3, TRUE),
  ('Facilities', '/facilities', 'main', 4, TRUE), ('Fixtures', '/fixtures', 'main', 5, TRUE), ('Events', '/events', 'main', 6, TRUE),
  ('Join', '/join', 'main', 7, TRUE), ('News', '/news', 'main', 8, TRUE), ('Merchandise', '/merchandise', 'main', 9, TRUE),
  ('Kitchen', '/kitchen', 'main', 10, TRUE), ('Sponsors', '/sponsors', 'main', 11, TRUE), ('Gallery', '/gallery', 'main', 12, TRUE),
  ('Volunteer', '/volunteer', 'main', 13, TRUE), ('Contact', '/contact', 'main', 14, TRUE),
  ('Geelong Cricket Association', 'https://www.geelongcricket.com.au', 'footer_affiliations', 1, TRUE),
  ('Newcomb Power Football & Netball Club', 'https://www.facebook.com/newcombpowerfnc/', 'footer_affiliations', 2, TRUE),
  ('Softball club details', '/contact?topic=softball', 'footer_affiliations', 3, TRUE),
  ('Darts club details', '/contact?topic=darts', 'footer_affiliations', 4, TRUE),
  ('Good Sports Level 3', 'https://www.goodsports.com.au', 'footer_affiliations', 5, TRUE)
ON CONFLICT (href, group_label) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

INSERT INTO teams (name, grade, description, playhq_url, sort_order, is_active)
VALUES
  ('Senior Men - 1st XI', 'GCA Grade 4', 'Our flagship senior side competes in Grade 4 of the Geelong Cricket Association. With a mix of experienced players and emerging talent, the 1st XI plays competitive one-day cricket every Saturday through the season at Grinter Reserve and away venues across Geelong.', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c/geelong-cricket-association-mens-competition-summer-202526/teams/newcomb-and-district-1sts/0f74d5e7', 1, TRUE),
  ('Senior Men - 2nd XI', 'GCA Grade 4', 'The 2nd XI provides a competitive pathway for developing players and experienced cricketers. Playing in the GCA Grade 4 competition alongside the 1st XI.', NULL, 2, TRUE),
  ('Senior Men - 3rd XI', 'GCA Hard Wicket', 'Our 3rd XI plays in the GCA hard wicket competition, offering a more social and accessible entry point for new and returning players.', NULL, 3, TRUE),
  ('Senior Women', 'GCA E Grade East', 'Our Senior Women''s team plays in GCA E Grade East. The side has been growing in numbers and strength each season, providing a welcoming pathway for women and girls to play competitive cricket in Geelong.', NULL, 4, TRUE),
  ('Junior Boys - Under 17s', 'GCA Junior Competition', 'Our U17s side competes in the GCA junior competition, developing the next generation of senior cricketers.', NULL, 5, TRUE),
  ('Junior Boys - Under 13s', 'GCA Junior Competition', 'The U13s had an outstanding 2025/26 season, going through to finals undefeated and reaching the GCA grand final. A fantastic group of young cricketers with a bright future.', NULL, 6, TRUE),
  ('Junior Boys - Under 11s', 'GCA Junior Competition', 'Our youngest Dinos learn the fundamentals of cricket in a supportive and fun environment, with a focus on participation, skills development, and enjoying the game.', NULL, 7, TRUE)
ON CONFLICT (name) DO UPDATE SET grade = EXCLUDED.grade, description = EXCLUDED.description, playhq_url = EXCLUDED.playhq_url, sort_order = EXCLUDED.sort_order;

INSERT INTO sponsor_tiers (value, label, sort_order, is_active)
VALUES ('major', 'Major Partner', 1, TRUE), ('gold', 'Gold Sponsor', 2, TRUE), ('silver', 'Silver Sponsor', 3, TRUE), ('standard', 'Standard Sponsor', 4, TRUE), ('community', 'Community Partner', 5, TRUE)
ON CONFLICT (value) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

INSERT INTO enquiry_types (value, label, sort_order, is_active)
VALUES ('general', 'General Enquiry', 1, TRUE), ('membership', 'Membership', 2, TRUE), ('sponsorship', 'Sponsorship', 3, TRUE), ('facilities', 'Facilities Hire', 4, TRUE), ('juniors', 'Junior Cricket', 5, TRUE), ('other', 'Other', 6, TRUE)
ON CONFLICT (value) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

INSERT INTO public_downloads (title, href, category, sort_order, is_active)
VALUES
  ('NDCC Sponsor Packages 2026 2027 Rev02', '/downloads/sponsorship/ndcc-sponsor-packages-2026-2027-rev02.pdf', 'sponsorship', 1, TRUE),
  ('NDCC Sponsorship Cover Letter 2026 2027 Rev02', '/downloads/sponsorship/ndcc-sponsorship-cover-letter-2026-2027-rev02.pdf', 'sponsorship', 2, TRUE),
  ('NDCC Sponsorship Proposal 2026 2027 Rev04', '/downloads/sponsorship/ndcc-sponsorship-proposal-2026-2027-rev04.pdf', 'sponsorship', 3, TRUE)
ON CONFLICT (href) DO UPDATE SET title = EXCLUDED.title, category = EXCLUDED.category, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

INSERT INTO achievements (title, image_url, alt_text, season_label, sort_order, is_active)
VALUES
  ('Club Championship Winners 2025/26', '/images/achievements/2025-26/club-championship-winners-2025-26.webp', 'NDCC Club Championship winners 2025/26 achievement image', '2025/26', 1, TRUE),
  ('Under 13 Juniors Premiers 2025/26', '/images/achievements/2025-26/u13-juniors-premiers-2025-26.webp', 'NDCC Under 13 juniors premiers 2025/26 achievement image', '2025/26', 2, TRUE),
  ('Division 4 First XI Premiers 2025/26', '/images/achievements/2025-26/division-4-first-xi-premiers-2025-26.webp', 'NDCC Division 4 First XI premiers 2025/26 achievement image', '2025/26', 3, TRUE)
ON CONFLICT (image_url) DO UPDATE SET title = EXCLUDED.title, alt_text = EXCLUDED.alt_text, season_label = EXCLUDED.season_label, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

INSERT INTO season_appointments (name, role, image_url, announcement_date, sort_order, is_active)
VALUES
  ('Aaron Morgan', '', '/images/season-appointments/2026-27/aaron-morgan-re-signed-2026-27.webp', '2026-05-01', 10, TRUE),
  ('Anthony Quarrell', '', '/images/season-appointments/2026-27/anthony-quarrell-re-signed-2026-27.webp', '2026-05-02', 11, TRUE),
  ('Blake Ritchie', '', '/images/season-appointments/2026-27/blake-ritchie-re-signed-2026-27.webp', '2026-05-03', 12, TRUE),
  ('Craig Hillgrove', 'Head Coach', '/images/season-appointments/2026-27/craig-hillgrove-head-coach-2026-27.webp', '2026-03-01', 1, TRUE),
  ('Freddie Norridge', '', '/images/season-appointments/2026-27/freddie-norridge-signed-2026-27.webp', '2026-05-04', 13, TRUE),
  ('Huey Neild', '', '/images/season-appointments/2026-27/huey-neild-re-signed-2026-27.webp', '2026-05-05', 14, TRUE),
  ('Kelsey Allan', 'Women''s Coach', '/images/season-appointments/2026-27/kelsey-allan-womens-coach-2026-27.webp', '2026-03-15', 2, TRUE),
  ('Nathan Keevil', '', '/images/season-appointments/2026-27/nathan-keevil-re-signed-2026-27.webp', '2026-05-06', 15, TRUE),
  ('Scott Kirby', '', '/images/season-appointments/2026-27/scott-kirby-re-signed-2026-27.webp', '2026-05-07', 16, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO content_blocks (block_key, page_slug, section_label, title, body, image_url, cta_label, cta_url, is_active)
VALUES
  ('home.hero', 'home', 'Top banner', 'Newcomb and District Cricket Club', 'Home of the Dinos. Est. 1972.', '/images/Turf_Ground.jpg', 'Join the Club', '/contact', TRUE),
  ('home.season_status', 'home', 'Season update', 'Season Update', 'Follow the latest Dinos season updates, match-day notices, and club announcements on our official channels.', NULL, 'View Results on PlayHQ', 'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c', TRUE),
  ('home.signings', 'home', 'Season appointments', '2026/27 Season Appointments', 'Player signings and coaching appointments announced for the season ahead.', NULL, 'More appointments to be announced', NULL, TRUE),
  ('home.join_cta', 'home', 'Join call to action', 'Ready to join the Dinos?', 'New players, families, supporters, and volunteers are always welcome at Grinter Reserve.', NULL, 'Get in Touch', '/contact', TRUE),
  ('footer.contact', 'footer', 'Footer club summary', 'Contact', 'Proudly competing in the Geelong Cricket Association since 1972.', NULL, NULL, NULL, TRUE)
ON CONFLICT (block_key) DO UPDATE SET section_label = EXCLUDED.section_label;

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE navigation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsor_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE enquiry_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read public site settings" ON site_settings;
CREATE POLICY "Public can read public site settings" ON site_settings FOR SELECT USING (is_public = TRUE);
DROP POLICY IF EXISTS "Public can read active navigation links" ON navigation_links;
CREATE POLICY "Public can read active navigation links" ON navigation_links FOR SELECT USING (is_active = TRUE);
DROP POLICY IF EXISTS "Public can read active teams" ON teams;
CREATE POLICY "Public can read active teams" ON teams FOR SELECT USING (is_active = TRUE);
DROP POLICY IF EXISTS "Public can read active sponsor tiers" ON sponsor_tiers;
CREATE POLICY "Public can read active sponsor tiers" ON sponsor_tiers FOR SELECT USING (is_active = TRUE);
DROP POLICY IF EXISTS "Public can read active enquiry types" ON enquiry_types;
CREATE POLICY "Public can read active enquiry types" ON enquiry_types FOR SELECT USING (is_active = TRUE);
DROP POLICY IF EXISTS "Public can read active downloads" ON public_downloads;
CREATE POLICY "Public can read active downloads" ON public_downloads FOR SELECT USING (is_active = TRUE);
DROP POLICY IF EXISTS "Public can read active achievements" ON achievements;
CREATE POLICY "Public can read active achievements" ON achievements FOR SELECT USING (is_active = TRUE);

NOTIFY pgrst, 'reload schema';
