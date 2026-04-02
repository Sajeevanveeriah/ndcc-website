CREATE TABLE IF NOT EXISTS meeting_minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES committee_users(id),
  updated_by UUID REFERENCES committee_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_minute_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minute_id UUID NOT NULL REFERENCES meeting_minutes(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('accepted', 'seconded')),
  acted_by UUID REFERENCES committee_users(id),
  acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_status ON meeting_minutes(status);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_meeting_date ON meeting_minutes(meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_minute_actions_minute_id ON meeting_minute_actions(minute_id);
