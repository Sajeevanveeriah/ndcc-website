CREATE TABLE IF NOT EXISTS club_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  club_name TEXT NOT NULL,
  club_short TEXT NOT NULL,
  club_nickname TEXT NOT NULL,
  established_year INTEGER,
  email TEXT,
  phone TEXT,
  ground_name TEXT,
  address TEXT,
  association_name TEXT,
  association_short TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  instagram_handle TEXT,
  playhq_url TEXT,
  google_maps_embed_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_club_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_club_settings_updated_at ON club_settings;
CREATE TRIGGER trg_club_settings_updated_at
BEFORE UPDATE ON club_settings
FOR EACH ROW
EXECUTE FUNCTION set_club_settings_updated_at();

ALTER TABLE club_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read club settings" ON club_settings;
CREATE POLICY "Public can read club settings" ON club_settings
  FOR SELECT USING (id = 'default');

DROP POLICY IF EXISTS "Admins have full access to club settings" ON club_settings;
CREATE POLICY "Admins have full access to club settings" ON club_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Committee can read club settings" ON club_settings;
CREATE POLICY "Committee can read club settings" ON club_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'president', 'secretary', 'committee'))
  );

INSERT INTO club_settings (
  id,
  club_name,
  club_short,
  club_nickname,
  established_year,
  email,
  phone,
  ground_name,
  address,
  association_name,
  association_short,
  facebook_url,
  instagram_url,
  instagram_handle,
  playhq_url,
  google_maps_embed_url
)
VALUES (
  'default',
  'Newcomb and District Cricket Club',
  'NDCC',
  'Dinos',
  1972,
  'ndsc.cricket@gmail.com',
  '0419 236 866',
  'Grinter Reserve',
  '141 Coppards Road, Moolap VIC 3224',
  'Geelong Cricket Association',
  'GCA',
  'https://www.facebook.com/NewcombDistrictCricketClub/',
  'https://www.instagram.com/newcombdistrictcc/',
  '@newcombdistrictcc',
  'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c',
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3140.5!2d144.38!3d-38.17!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sGrinter+Reserve+Moolap!5e0!3m2!1sen!2sau!4v1234567890'
)
ON CONFLICT (id) DO NOTHING;
