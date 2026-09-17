-- Content-only recovery history. Never copy payment, enquiry or session rows.
CREATE TABLE public.editorial_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_table text NOT NULL,
  record_id uuid NOT NULL,
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  action text NOT NULL CHECK(action IN ('UPDATE','DELETE')),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.editorial_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.editorial_revisions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.editorial_revisions TO service_role;
CREATE INDEX editorial_revisions_record_idx ON public.editorial_revisions(resource_table,record_id,changed_at DESC);

CREATE FUNCTION public.ndcc_archive_editorial_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor text;
BEGIN
  actor := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-ndcc-actor';
  INSERT INTO public.editorial_revisions(resource_table,record_id,revision,snapshot,action,changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, OLD.revision, to_jsonb(OLD), TG_OP,
      CASE WHEN actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN actor::uuid ELSE NULL END);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ndcc_archive_editorial_revision() FROM PUBLIC, anon, authenticated;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['news','publications','events','content_blocks'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN revision integer NOT NULL DEFAULT 1', tbl);
    EXECUTE format('CREATE TRIGGER editorial_revision_history BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.ndcc_archive_editorial_revision()', tbl);
  END LOOP;
END $$;
-- Rollback: old application versions ignore revision fields; keep history.
NOTIFY pgrst, 'reload schema';
