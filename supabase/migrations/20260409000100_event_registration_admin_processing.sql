-- Add processed tracking for event registrations admin workflow

ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS processed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_event_registrations_processed
  ON event_registrations (processed, created_at DESC);

NOTIFY pgrst, 'reload schema';
