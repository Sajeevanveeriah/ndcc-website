CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  description TEXT NOT NULL,
  captain TEXT,
  playhq_url TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name_unique ON teams(name);
CREATE INDEX IF NOT EXISTS idx_teams_active_sort ON teams(is_active, sort_order, name);

CREATE OR REPLACE FUNCTION set_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_teams_updated_at ON teams;
CREATE TRIGGER trg_teams_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW
EXECUTE FUNCTION set_teams_updated_at();

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active teams" ON teams;
CREATE POLICY "Public can read active teams" ON teams
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins have full access to teams" ON teams;
CREATE POLICY "Admins have full access to teams" ON teams
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Committee can read teams" ON teams;
CREATE POLICY "Committee can read teams" ON teams
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'committee'))
  );

INSERT INTO teams (name, grade, description, captain, playhq_url, image_url, sort_order, is_active)
VALUES
  (
    'Senior Men - 1st XI',
    'GCA Grade 4',
    'Our flagship senior side competes in Grade 4 of the Geelong Cricket Association. With a mix of experienced players and emerging talent, the 1st XI plays competitive one-day cricket every Saturday through the season at Grinter Reserve and away venues across Geelong.',
    NULL,
    'https://www.playhq.com/cricket-australia/org/newcomb-and-district-cricket-club/2c2bff9c/geelong-cricket-association-mens-competition-summer-202526/teams/newcomb-and-district-1sts/0f74d5e7',
    NULL,
    1,
    TRUE
  ),
  (
    'Senior Men - 2nd XI',
    'GCA Grade 4',
    'The 2nd XI provides a competitive pathway for developing players and experienced cricketers. Playing in the GCA Grade 4 competition alongside the 1st XI.',
    NULL,
    NULL,
    NULL,
    2,
    TRUE
  ),
  (
    'Senior Men - 3rd XI',
    'GCA Hard Wicket',
    'Our 3rd XI plays in the GCA hard wicket competition, offering a more social and accessible entry point for new and returning players.',
    NULL,
    NULL,
    NULL,
    3,
    TRUE
  ),
  (
    'Senior Women',
    'GCA E Grade East',
    'Our Senior Women''s team plays in GCA E Grade East. The side has been growing in numbers and strength each season, providing a welcoming pathway for women and girls to play competitive cricket in Geelong.',
    NULL,
    NULL,
    '/images/Womens_Team.jpg',
    4,
    TRUE
  ),
  (
    'Junior Boys - Under 17s',
    'GCA Junior Competition',
    'Our U17s side competes in the GCA junior competition, developing the next generation of senior cricketers.',
    NULL,
    NULL,
    NULL,
    5,
    TRUE
  ),
  (
    'Junior Boys - Under 13s',
    'GCA Junior Competition',
    'The U13s had an outstanding 2025/26 season, going through to finals undefeated and reaching the GCA grand final. A fantastic group of young cricketers with a bright future.',
    NULL,
    NULL,
    NULL,
    6,
    TRUE
  ),
  (
    'Junior Boys - Under 11s',
    'GCA Junior Competition',
    'Our youngest Dinos learn the fundamentals of cricket in a supportive and fun environment, with a focus on participation, skills development, and enjoying the game.',
    NULL,
    NULL,
    NULL,
    7,
    TRUE
  )
ON CONFLICT (name) DO UPDATE SET
  grade = EXCLUDED.grade,
  description = EXCLUDED.description,
  captain = EXCLUDED.captain,
  playhq_url = EXCLUDED.playhq_url,
  image_url = EXCLUDED.image_url,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload schema';
