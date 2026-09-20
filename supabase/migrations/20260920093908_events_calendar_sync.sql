-- Events owns registration details; calendar keeps its display and visibility controls.
ALTER TABLE public.calendar_events
  ADD COLUMN source_event_id uuid UNIQUE REFERENCES public.events(id) ON DELETE SET NULL;

-- Link only the verified legacy pairs. Match names and Melbourne dates, not generated IDs.
WITH names(event_title, calendar_title) AS (VALUES
  ('Season Launch 2026/27', '2026/2027 Season Launch'),
  ('iPod Shuffle', 'iPod Shuffle Night'), ('Snail Racing', 'Snail Race'),
  ('Halloween', 'Halloween'), ('Trivia Night', 'Trivia Night'),
  ('Twilight Market', 'Twilight Market'), ('Christmas Party', 'Christmas Party'),
  ('Reverse Draw', 'Reverse Draw'), ('Karaoke Night', 'Karaoke'),
  ('Twilight Game & Past Players', 'Twilight Game & Past Players Day'),
  ('Presentation Night', 'Presentation Night')
), pairs AS (
  SELECT e.id AS event_id, c.id AS calendar_id, e.image_url,
    count(*) OVER (PARTITION BY e.id) AS event_matches,
    count(*) OVER (PARTITION BY c.id) AS calendar_matches
  FROM names n JOIN public.events e ON e.title = n.event_title
  JOIN public.calendar_events c ON c.title = n.calendar_title
    AND (c.start_at AT TIME ZONE 'Australia/Melbourne')::date = (e.date AT TIME ZONE 'Australia/Melbourne')::date
)
UPDATE public.calendar_events c SET source_event_id = p.event_id,
  image_url = COALESCE(c.image_url, p.image_url),
  cta_url = COALESCE(c.cta_url, '/events/' || p.event_id::text),
  cta_label = COALESCE(c.cta_label, 'Event details')
FROM pairs p WHERE c.id = p.calendar_id AND p.event_matches = 1 AND p.calendar_matches = 1;

CREATE FUNCTION public.ndcc_sync_event_calendar() RETURNS trigger
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
      end_at = CASE WHEN NEW.date IS DISTINCT FROM OLD.date AND c.end_at IS NOT NULL THEN NEW.date + (c.end_at - c.start_at) ELSE c.end_at END,
      start_at = CASE WHEN NEW.date IS DISTINCT FROM OLD.date THEN NEW.date ELSE c.start_at END,
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
REVOKE ALL ON FUNCTION public.ndcc_sync_event_calendar() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_event_calendar AFTER INSERT OR UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.ndcc_sync_event_calendar();
CREATE TRIGGER archive_event_calendar BEFORE DELETE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.ndcc_sync_event_calendar();

INSERT INTO public.calendar_events
  (source_event_id,title,description,start_at,location,image_url,status,visibility,
   show_on_calendar,show_on_home,show_on_contact,cta_url,cta_label,ticket_price,capacity)
SELECT e.id,e.title,e.description,e.date,e.location,e.image_url,
  CASE WHEN e.published THEN 'published' ELSE 'draft' END,'public',true,true,true,
  '/events/' || e.id::text,'Event details',e.ticket_price,e.capacity
FROM public.events e WHERE e.date IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.calendar_events c WHERE c.source_event_id = e.id);

-- Rollback: drop trigger sync_event_calendar on public.events to stop future sync.
-- Keep the linked calendar records and source_event_id column to preserve content.
NOTIFY pgrst, 'reload schema';
