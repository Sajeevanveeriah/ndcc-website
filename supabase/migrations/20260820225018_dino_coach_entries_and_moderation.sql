ALTER TABLE fantasy_managers
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS age_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS team_name_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS team_name_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rules_version_accepted TEXT,
  ADD COLUMN IF NOT EXISTS rules_accepted_at TIMESTAMPTZ;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fantasy_managers_team_name_status_check') THEN
    ALTER TABLE fantasy_managers ADD CONSTRAINT fantasy_managers_team_name_status_check CHECK (team_name_status IN ('pending','approved','review_required','replaced'));
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS fantasy_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), manager_id UUID NOT NULL REFERENCES fantasy_managers(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES fantasy_seasons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'payment_required' CHECK (status IN ('payment_required','pending','paid','failed','expired','refunded','disputed','suspended')),
  entry_fee_cents INTEGER NOT NULL CHECK (entry_fee_cents > 0), currency TEXT NOT NULL DEFAULT 'AUD' CHECK (currency='AUD'),
  stripe_checkout_session_id TEXT, stripe_payment_intent_id TEXT, provider_event_id TEXT, paid_at TIMESTAMPTZ, refunded_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(manager_id,season_id), UNIQUE(stripe_checkout_session_id), UNIQUE(provider_event_id)
);
CREATE INDEX IF NOT EXISTS fantasy_entries_season_status_idx ON fantasy_entries(season_id,status);
ALTER TABLE fantasy_entries ENABLE ROW LEVEL SECURITY; REVOKE ALL ON fantasy_entries FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS fantasy_team_name_moderation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), manager_id UUID NOT NULL REFERENCES fantasy_managers(id) ON DELETE CASCADE,
  submitted_name TEXT NOT NULL, resulting_name TEXT, status TEXT NOT NULL CHECK (status IN ('approved','review_required','replaced')),
  reason TEXT, reviewed_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fantasy_team_name_moderation_manager_idx ON fantasy_team_name_moderation(manager_id,created_at DESC);
ALTER TABLE fantasy_team_name_moderation ENABLE ROW LEVEL SECURITY; REVOKE ALL ON fantasy_team_name_moderation FROM anon, authenticated;
