BEGIN;
INSERT INTO public.news(id,title,content,author,published,published_at)
VALUES ('10000000-0000-4000-8000-000000000001','Scheduled test','Test','NDCC',true,now()+interval '1 day');
INSERT INTO public.publications(id,publication_type,title,slug,content,issue_date,published,published_at)
VALUES ('10000000-0000-4000-8000-000000000002','weekly_newsletter','Scheduled test','scheduled-test','Test',current_date,true,now()+interval '1 day');
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.news WHERE id='10000000-0000-4000-8000-000000000001')
    OR EXISTS(SELECT 1 FROM public.publications WHERE id='10000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'Scheduled content leaked through RLS';
  END IF;
  IF has_function_privilege('anon','public.ndcc_take_rate_limit(text,integer,integer)','EXECUTE')
    OR has_function_privilege('anon','public.ndcc_resend_webhook_secret()','EXECUTE')
    OR has_table_privilege('anon','public.editorial_revisions','SELECT')
    OR has_table_privilege('authenticated','public.email_delivery_events','SELECT') THEN
    RAISE EXCEPTION 'Operational data or secret function exposed';
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.headers','{"x-ndcc-actor":"10000000-0000-4000-8000-000000000003"}',true);
UPDATE public.news SET title='Updated test' WHERE id='10000000-0000-4000-8000-000000000001' AND revision=1;
DO $$ BEGIN
  IF (SELECT revision FROM public.news WHERE id='10000000-0000-4000-8000-000000000001') <> 2 THEN RAISE EXCEPTION 'Revision did not advance'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.editorial_revisions WHERE record_id='10000000-0000-4000-8000-000000000001'
    AND snapshot->>'title'='Scheduled test' AND changed_by='10000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Recoverable content history missing'; END IF;
  UPDATE public.news SET title='Stale edit' WHERE id='10000000-0000-4000-8000-000000000001' AND revision=1;
  IF FOUND THEN RAISE EXCEPTION 'Stale revision overwrote newer content'; END IF;
END $$;
DELETE FROM public.news WHERE id='10000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.editorial_revisions WHERE record_id='10000000-0000-4000-8000-000000000001' AND action='DELETE' AND snapshot->>'title'='Updated test') THEN RAISE EXCEPTION 'Deleted content not recoverable'; END IF;
END $$;
ROLLBACK;
