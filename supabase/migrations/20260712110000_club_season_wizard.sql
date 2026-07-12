-- Start New Season wizard state and atomic activation support.
-- Additive and reversible.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS activate_club_season(UUID, TEXT);
--   DROP TABLE IF EXISTS club_season_activation_audit;
--   DROP TABLE IF EXISTS club_season_wizard_states;

CREATE TABLE IF NOT EXISTS club_season_wizard_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  club_season_id UUID REFERENCES club_seasons(id) ON DELETE SET NULL,
  source_season_id UUID REFERENCES club_seasons(id) ON DELETE SET NULL,
  current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step >= 1 AND current_step <= 11),
  completed_steps INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  copy_sections JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  stale_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  preview JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','activated','cancelled')),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_club_season_wizard_states_updated_at ON club_season_wizard_states;
CREATE TRIGGER trg_club_season_wizard_states_updated_at
BEFORE UPDATE ON club_season_wizard_states
FOR EACH ROW EXECUTE FUNCTION set_fantasy_updated_at();

CREATE INDEX IF NOT EXISTS club_season_wizard_states_status_idx ON club_season_wizard_states(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS club_season_wizard_states_season_idx ON club_season_wizard_states(club_season_id);

CREATE TABLE IF NOT EXISTS club_season_activation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_season_id UUID NOT NULL REFERENCES club_seasons(id) ON DELETE CASCADE,
  previous_current_season_id UUID REFERENCES club_seasons(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('activated','rolled_back')),
  actor TEXT,
  rollback_sql TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS club_season_activation_audit_season_idx ON club_season_activation_audit(club_season_id, created_at DESC);

CREATE OR REPLACE FUNCTION activate_club_season(p_club_season_id UUID, p_actor TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  previous_current UUID;
BEGIN
  SELECT id INTO previous_current FROM club_seasons WHERE is_current = TRUE LIMIT 1;

  UPDATE club_seasons
  SET is_current = FALSE,
      status = CASE WHEN status = 'active' THEN 'completed'::club_season_status ELSE status END,
      updated_by = p_actor,
      updated_at = NOW()
  WHERE is_current = TRUE AND id <> p_club_season_id;

  UPDATE club_seasons
  SET is_current = TRUE,
      status = 'active',
      activated_at = COALESCE(activated_at, NOW()),
      updated_by = p_actor,
      updated_at = NOW()
  WHERE id = p_club_season_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'club season % was not found', p_club_season_id;
  END IF;

  INSERT INTO club_season_activation_audit (club_season_id, previous_current_season_id, action, actor, rollback_sql, detail)
  VALUES (
    p_club_season_id,
    previous_current,
    'activated',
    p_actor,
    format('SELECT activate_club_season(%L::uuid, %L);', previous_current, p_actor),
    jsonb_build_object('activated_at', NOW())
  );

  RETURN previous_current;
END;
$$;

ALTER TABLE club_season_wizard_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_season_activation_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS club_season_wizard_states_no_public ON club_season_wizard_states;
DROP POLICY IF EXISTS club_season_activation_audit_no_public ON club_season_activation_audit;
CREATE POLICY club_season_wizard_states_no_public ON club_season_wizard_states FOR ALL USING (FALSE) WITH CHECK (FALSE);
CREATE POLICY club_season_activation_audit_no_public ON club_season_activation_audit FOR ALL USING (FALSE) WITH CHECK (FALSE);

NOTIFY pgrst, 'reload schema';
