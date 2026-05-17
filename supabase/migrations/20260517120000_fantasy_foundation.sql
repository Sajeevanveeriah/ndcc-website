CREATE TABLE IF NOT EXISTS fantasy_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  playhq_player_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('WK', 'BAT', 'AR', 'BOWL')),
  team_label TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_players_display_name_lower_idx
  ON fantasy_players (LOWER(display_name));

CREATE TABLE IF NOT EXISTS fantasy_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  deadline_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'locked', 'scored', 'final')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fantasy_player_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES fantasy_players(id) ON DELETE CASCADE,
  price_million NUMERIC(5,1) NOT NULL,
  effective_round_id UUID REFERENCES fantasy_rounds(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fantasy_scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  points NUMERIC(8,2) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fantasy_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT,
  source TEXT NOT NULL DEFAULT 'manual_csv',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'published', 'rejected')),
  uploaded_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fantasy_match_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id UUID REFERENCES fantasy_import_batches(id) ON DELETE SET NULL,
  round_id UUID REFERENCES fantasy_rounds(id) ON DELETE SET NULL,
  player_id UUID REFERENCES fantasy_players(id) ON DELETE CASCADE,
  match_date DATE,
  opponent TEXT,
  runs INTEGER DEFAULT 0,
  wickets INTEGER DEFAULT 0,
  maidens INTEGER DEFAULT 0,
  catches INTEGER DEFAULT 0,
  runouts INTEGER DEFAULT 0,
  stumpings INTEGER DEFAULT 0,
  ducks INTEGER DEFAULT 0,
  not_out BOOLEAN DEFAULT FALSE,
  player_of_match BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_fantasy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fantasy_players_updated_at ON fantasy_players;
CREATE TRIGGER trg_fantasy_players_updated_at
BEFORE UPDATE ON fantasy_players
FOR EACH ROW
EXECUTE FUNCTION set_fantasy_updated_at();

DROP TRIGGER IF EXISTS trg_fantasy_rounds_updated_at ON fantasy_rounds;
CREATE TRIGGER trg_fantasy_rounds_updated_at
BEFORE UPDATE ON fantasy_rounds
FOR EACH ROW
EXECUTE FUNCTION set_fantasy_updated_at();

DROP TRIGGER IF EXISTS trg_fantasy_scoring_rules_updated_at ON fantasy_scoring_rules;
CREATE TRIGGER trg_fantasy_scoring_rules_updated_at
BEFORE UPDATE ON fantasy_scoring_rules
FOR EACH ROW
EXECUTE FUNCTION set_fantasy_updated_at();

INSERT INTO fantasy_scoring_rules (key, label, points, enabled, description)
VALUES
  ('runs', 'Runs', 1, TRUE, 'Points awarded per run scored.'),
  ('wickets', 'Wickets', 25, TRUE, 'Points awarded per wicket taken.'),
  ('maidens', 'Maidens', 10, TRUE, 'Points awarded per maiden over bowled.'),
  ('catches', 'Catches', 10, TRUE, 'Points awarded per catch.'),
  ('runouts', 'Run outs', 15, TRUE, 'Points awarded per run out.'),
  ('stumpings', 'Stumpings', 15, TRUE, 'Points awarded per stumping.'),
  ('ducks', 'Ducks', -10, TRUE, 'Points deducted for a duck.'),
  ('not_out_bonus', 'Not out bonus', 5, TRUE, 'Bonus points for finishing not out.'),
  ('player_of_match_bonus', 'Player of match bonus', 20, TRUE, 'Bonus points for player of the match.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE fantasy_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_player_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_match_stats ENABLE ROW LEVEL SECURITY;
