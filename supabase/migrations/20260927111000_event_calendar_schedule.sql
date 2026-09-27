-- Linked events own their scheduled start; calendar keeps visibility/status.
-- Rollback: drop trigger check_linked_event_start on public.calendar_events;
-- restore ndcc_sync_event_calendar from 20260920093908. The six
-- corrected calendar starts can be restored from the old_start values below,
-- only if they still equal new_start. Do not overwrite later committee edits.
BEGIN;
SET LOCAL lock_timeout = '3s';
CREATE OR REPLACE FUNCTION public.ndcc_sync_event_calendar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.calendar_events SET status = 'archived' WHERE source_event_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.date IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.calendar_events c SET
      title = CASE WHEN NEW.title IS DISTINCT FROM OLD.title THEN NEW.title ELSE c.title END,
      description = CASE WHEN NEW.description IS DISTINCT FROM OLD.description THEN NEW.description ELSE c.description END,
      end_at = CASE WHEN NEW.date IS DISTINCT FROM c.start_at AND c.end_at IS NOT NULL THEN NEW.date + (c.end_at - c.start_at) ELSE c.end_at END,
      start_at = NEW.date,
      location = CASE WHEN NEW.location IS DISTINCT FROM OLD.location THEN NEW.location ELSE c.location END,
      image_url = CASE WHEN NEW.image_url IS DISTINCT FROM OLD.image_url THEN NEW.image_url ELSE c.image_url END,
      ticket_price = NEW.ticket_price, capacity = NEW.capacity,
      status = CASE WHEN NOT NEW.published THEN 'draft'
        WHEN NEW.published IS DISTINCT FROM OLD.published THEN 'published' ELSE c.status END
    WHERE source_event_id = NEW.id;
    IF FOUND THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO public.calendar_events
    (source_event_id,title,description,start_at,location,image_url,status,visibility,
     show_on_calendar,show_on_home,show_on_contact,cta_url,cta_label,ticket_price,capacity)
  VALUES (NEW.id,NEW.title,NEW.description,NEW.date,NEW.location,NEW.image_url,
    CASE WHEN NEW.published THEN 'published' ELSE 'draft' END,'public',true,true,true,
    '/events/' || NEW.id::text,'Event details',NEW.ticket_price,NEW.capacity)
  ON CONFLICT (source_event_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Prevent a linked calendar edit from silently diverging from its event.
CREATE FUNCTION public.check_linked_event_start() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE event_start timestamptz;
BEGIN
  IF NEW.source_event_id IS NOT NULL THEN
    SELECT date INTO event_start FROM public.events WHERE id=NEW.source_event_id;
    IF event_start IS NOT NULL AND NEW.start_at IS DISTINCT FROM event_start THEN
      RAISE EXCEPTION 'Change this start time in Events. The linked calendar uses the event start time.' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_linked_event_start() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER check_linked_event_start BEFORE INSERT OR UPDATE OF start_at,source_event_id
ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.check_linked_event_start();

-- Reconcile the six observed legacy differences, only while both source
-- records still contain the inspected values. Do not invent event times.
WITH changes(title,old_start,new_start) AS (VALUES
 ('iPod Shuffle','2026-10-03T09:00:00Z'::timestamptz,'2026-10-03T09:30:00Z'::timestamptz),
 ('Snail Racing','2026-10-24T08:00:00Z'::timestamptz,'2026-10-24T08:30:00Z'::timestamptz),
 ('Halloween','2026-10-31T08:00:00Z'::timestamptz,'2026-10-31T08:30:00Z'::timestamptz),
 ('Trivia Night','2026-11-14T08:00:00Z'::timestamptz,'2026-11-14T08:30:00Z'::timestamptz),
 ('Christmas Party','2026-12-19T08:00:00Z'::timestamptz,'2026-12-19T07:30:00Z'::timestamptz),
 ('Karaoke Night','2027-02-06T08:00:00Z'::timestamptz,'2027-02-06T08:30:00Z'::timestamptz)
)
UPDATE public.calendar_events c SET start_at=e.date,
 end_at=CASE WHEN c.end_at IS NULL THEN NULL ELSE e.date+(c.end_at-c.start_at) END
FROM public.events e JOIN changes x ON e.title=x.title AND e.date=x.new_start
WHERE c.source_event_id=e.id AND c.start_at=x.old_start;
COMMIT;
