ALTER TABLE public.meeting_minutes
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_size integer;

-- No public/client policies: documents are served only through the authenticated API.
DO $$ BEGIN
IF to_regclass('storage.buckets') IS NOT NULL THEN
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('meeting-minute-documents', 'meeting-minute-documents', false, 4194304,
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

END IF;
END $$;
