-- Transaction-only integration test: no test records are committed.
BEGIN;
DO $$
DECLARE event_id uuid; calendar_id uuid; row_data public.calendar_events%ROWTYPE;
BEGIN
  INSERT INTO public.events(title,description,date,location,published,image_url,ticket_price)
    VALUES ('Calendar sync regression test','Test only','2030-09-25T01:00:00Z','Test venue',false,'/images/test.webp',0)
    RETURNING id INTO event_id;
  SELECT * INTO STRICT row_data FROM public.calendar_events WHERE source_event_id=event_id;
  calendar_id := row_data.id;
  IF row_data.status <> 'draft' OR row_data.image_url <> '/images/test.webp' THEN RAISE EXCEPTION 'Draft/image sync failed'; END IF;
  UPDATE public.events SET published=true WHERE id=event_id;
  SELECT * INTO STRICT row_data FROM public.calendar_events WHERE id=calendar_id;
  IF row_data.status <> 'published' THEN RAISE EXCEPTION 'Publish failed'; END IF;
  UPDATE public.calendar_events SET end_at=start_at+interval '2 hours', visibility='committee',show_on_home=false,status='postponed' WHERE id=calendar_id;
  UPDATE public.events SET date=date+interval '1 day',image_url='/images/new.webp' WHERE id=event_id;
  SELECT * INTO STRICT row_data FROM public.calendar_events WHERE id=calendar_id;
  IF row_data.start_at <> '2030-09-26T01:00:00Z'::timestamptz OR row_data.end_at-row_data.start_at <> interval '2 hours'
    OR row_data.visibility <> 'committee' OR row_data.show_on_home OR row_data.status <> 'postponed'
    OR row_data.image_url <> '/images/new.webp' THEN RAISE EXCEPTION 'Update/privacy/duration preservation failed'; END IF;
  UPDATE public.events SET published=false WHERE id=event_id;
  IF (SELECT status FROM public.calendar_events WHERE id=calendar_id) <> 'draft' THEN RAISE EXCEPTION 'Unpublish failed'; END IF;
  DELETE FROM public.events WHERE id=event_id;
  SELECT * INTO STRICT row_data FROM public.calendar_events WHERE id=calendar_id;
  IF row_data.status <> 'archived' OR row_data.source_event_id IS NOT NULL THEN RAISE EXCEPTION 'Delete/archive failed'; END IF;
END $$;
SELECT 'PASS: create, publish, image/date update, duration/privacy preservation, unpublish and delete/archive' AS result;
ROLLBACK;
