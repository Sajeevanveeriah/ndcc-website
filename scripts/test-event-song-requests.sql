-- Isolated disposable database only; test data always rolls back.
BEGIN;
DO $$
DECLARE song_event uuid; ticket_event uuid; reg uuid; songs jsonb;
BEGIN
  INSERT INTO public.events(title,date,published,ticket_price,registration_mode)
  VALUES('Song fixture',now()+interval '7 days',true,10,'song_requests') RETURNING id INTO song_event;
  INSERT INTO public.events(title,date,published,ticket_price) VALUES('Ticket fixture',now()+interval '7 days',true,5) RETURNING id INTO ticket_event;
  IF (SELECT registration_mode FROM public.events WHERE id=ticket_event)<>'tickets' THEN RAISE EXCEPTION 'Existing events must default to tickets'; END IF;

  reg:=public.ndcc_register_event_song_entry(song_event,'Fixture','fixture@example.invalid','0400000000','pending_bank_transfer','REF1',null,
    '[{"title":"Thunderstruck","artist":"AC/DC"},{"title":"Mr Brightside","artist":""}]');
  SELECT song_requests INTO songs FROM public.event_registrations WHERE id=reg;
  IF jsonb_array_length(songs)<>2 OR songs->0->>'title'<>'Thunderstruck' THEN RAISE EXCEPTION 'Songs were not stored in order'; END IF;
  IF (SELECT quantity FROM public.event_registrations WHERE id=reg)<>1 THEN RAISE EXCEPTION 'A song entry must hold one place'; END IF;

  BEGIN
    PERFORM public.ndcc_register_event_song_entry(ticket_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[{"title":"A"}]');
    RAISE EXCEPTION 'Ticket event accepted a song entry';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'Event registration unavailable%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.ndcc_register_event_song_entry(song_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[]');
    RAISE EXCEPTION 'Empty song list accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.ndcc_register_event_song_entry(song_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[{"title":"  "}]');
    RAISE EXCEPTION 'Blank song title accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.ndcc_register_event_song_entry(song_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,
      (SELECT jsonb_agg(jsonb_build_object('title','Song '||g)) FROM generate_series(1,31) g));
    RAISE EXCEPTION '31 songs accepted in one order';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    UPDATE public.events SET registration_mode='raffle' WHERE id=song_event;
    RAISE EXCEPTION 'Unknown registration mode accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Registration closes when the event starts, as for ticket events.
  UPDATE public.events SET date=now()-interval '1 minute' WHERE id=song_event;
  BEGIN
    PERFORM public.ndcc_register_event_song_entry(song_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[{"title":"A"}]');
    RAISE EXCEPTION 'Started event accepted a song entry';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'Event registration closed%' THEN RAISE; END IF;
  END;
  IF has_function_privilege('anon','public.ndcc_register_event_song_entry(uuid,text,text,text,text,text,uuid,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.ndcc_register_event_song_entry(uuid,text,text,text,text,text,uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Browser roles can call the song entry function';
  END IF;
  RAISE NOTICE 'PASS song entries: stored atomically, ticket events refused, limits, closing time and privileges';
END;
$$;
ROLLBACK;
