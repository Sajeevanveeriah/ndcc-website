-- Isolated disposable database only; test data always rolls back.
BEGIN;
DO $$
DECLARE snail_event uuid; ticket_event uuid; song_event uuid; reg uuid; snails jsonb;
BEGIN
  -- Capacity 1 must not limit snail sales.
  INSERT INTO public.events(title,date,published,ticket_price,capacity,registration_mode,snail_race_count,snails_per_race,race_sponsorship_price)
  VALUES('Snail fixture',now()+interval '7 days',true,10,1,'snail_race',8,8,50) RETURNING id INTO snail_event;
  INSERT INTO public.events(title,date,published,ticket_price) VALUES('Ticket fixture',now()+interval '7 days',true,5) RETURNING id INTO ticket_event;
  INSERT INTO public.events(title,date,published,ticket_price,registration_mode) VALUES('Song fixture',now()+interval '7 days',true,10,'song_requests') RETURNING id INTO song_event;

  reg:=public.ndcc_register_event_snail_entry(snail_event,'Fixture','fixture@example.invalid','0400000000','pending_bank_transfer','REF1',null,
    '[{"snail_name":"Turbo","player_name":"Fixture"},{"snail_name":"Slow Coach","player_name":"The Kids"}]',1);
  SELECT snail_entries INTO snails FROM public.event_registrations WHERE id=reg;
  IF jsonb_array_length(snails)<>2 OR snails->1->>'snail_name'<>'Slow Coach' THEN RAISE EXCEPTION 'Snails were not stored in order'; END IF;
  IF (SELECT quantity FROM public.event_registrations WHERE id=reg)<>2 THEN RAISE EXCEPTION 'Quantity must count the snails'; END IF;
  IF (SELECT race_sponsorships FROM public.event_registrations WHERE id=reg)<>1 THEN RAISE EXCEPTION 'Sponsorships not stored'; END IF;

  -- Unlimited: 200 more snails in one order, and another order after that.
  PERFORM public.ndcc_register_event_snail_entry(snail_event,'Big buyer','big@example.invalid','0400000000','pending_bank_transfer',null,null,
    (SELECT jsonb_agg(jsonb_build_object('snail_name','Snail '||g,'player_name','Player '||g)) FROM generate_series(1,200) g),0);
  PERFORM public.ndcc_register_event_snail_entry(snail_event,'Sponsor only','s@example.invalid','0400000000','pending_bank_transfer',null,null,'[]',2);
  IF (SELECT sum(jsonb_array_length(coalesce(snail_entries,'[]'))) FROM public.event_registrations WHERE event_id=snail_event)<>202 THEN
    RAISE EXCEPTION 'Snail sales were capped';
  END IF;
  IF (SELECT snail_entries FROM public.event_registrations WHERE name='Sponsor only') IS NOT NULL THEN RAISE EXCEPTION 'Sponsor-only order stored snails'; END IF;

  BEGIN
    PERFORM public.ndcc_register_event_snail_entry(snail_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,
      (SELECT jsonb_agg(jsonb_build_object('snail_name','S'||g,'player_name','P')) FROM generate_series(1,201) g),0);
    RAISE EXCEPTION '201 snails accepted in one order';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.ndcc_register_event_snail_entry(snail_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[]',0);
    RAISE EXCEPTION 'Empty order accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.ndcc_register_event_snail_entry(snail_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[{"snail_name":"  ","player_name":"P"}]',0);
    RAISE EXCEPTION 'Blank snail name accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.ndcc_register_event_snail_entry(snail_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[{"snail_name":"ABCDEFGHIJKLMNOPQRSTUVWXY","player_name":"P"}]',0);
    RAISE EXCEPTION '25-character snail name accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.ndcc_register_event_snail_entry(snail_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[{"snail_name":"Turbo"}]',0);
    RAISE EXCEPTION 'Snail without a player name accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.ndcc_register_event_snail_entry(snail_event,'F','f@example.invalid','0400000000','paid',null,null,'[{"snail_name":"Turbo","player_name":"P"}]',0);
    RAISE EXCEPTION 'Public entry recorded as paid';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  -- Snails only on snail events; tickets and songs never on snail events.
  BEGIN
    PERFORM public.ndcc_register_event_snail_entry(ticket_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[{"snail_name":"Turbo","player_name":"P"}]',0);
    RAISE EXCEPTION 'Ticket event accepted snails';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'Event registration unavailable%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.ndcc_register_event_snail_entry(song_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[{"snail_name":"Turbo","player_name":"P"}]',0);
    RAISE EXCEPTION 'Song event accepted snails';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;
  BEGIN
    PERFORM public.ndcc_register_event_attendee(snail_event,'F','f@example.invalid','0400000000',1,'pending_bank_transfer',null,null);
    RAISE EXCEPTION 'Ticket registration accepted for a snail event';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'Event registration unavailable%' THEN RAISE; END IF;
  END;
  -- Ticket and song events still behave as before.
  PERFORM public.ndcc_register_event_attendee(ticket_event,'F','f@example.invalid','0400000000',2,'pending_bank_transfer',null,null);
  PERFORM public.ndcc_register_event_song_entry(song_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[{"title":"A"}]');

  -- Sponsorship needs a price; settings stay in range.
  UPDATE public.events SET race_sponsorship_price=null WHERE id=snail_event;
  BEGIN
    PERFORM public.ndcc_register_event_snail_entry(snail_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[]',1);
    RAISE EXCEPTION 'Unpriced sponsorship accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;
  BEGIN
    UPDATE public.events SET snails_per_race=21 WHERE id=snail_event;
    RAISE EXCEPTION 'Snails per race above 20 accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.events SET snail_race_count=0 WHERE id=snail_event;
    RAISE EXCEPTION 'Zero races accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Purchases close when the event starts.
  UPDATE public.events SET date=now()-interval '1 minute' WHERE id=snail_event;
  BEGIN
    PERFORM public.ndcc_register_event_snail_entry(snail_event,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[{"snail_name":"Turbo","player_name":"P"}]',0);
    RAISE EXCEPTION 'Started event accepted snails';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE 'Event registration closed%' THEN RAISE; END IF;
  END;
END $$;
-- Only the service role may call the snail function.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.ndcc_register_event_snail_entry(uuid,text,text,text,text,text,uuid,jsonb,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.ndcc_register_event_snail_entry(uuid,text,text,text,text,text,uuid,jsonb,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Public roles can call the snail entry function';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.ndcc_register_event_snail_entry(uuid,text,text,text,text,text,uuid,jsonb,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Service role cannot call the snail entry function';
  END IF;
END $$;
-- Sponsor names (20261005120000): stored with the sponsorship, only when racing is sponsored.
DO $$
DECLARE ev uuid; reg uuid;
BEGIN
  INSERT INTO public.events(title,date,published,ticket_price,registration_mode,race_sponsorship_price)
  VALUES('Sponsor fixture',now()+interval '7 days',true,10,'snail_race',50) RETURNING id INTO ev;
  reg:=public.ndcc_register_event_snail_entry(ev,'Buyer','b@example.invalid','0400000000','pending_bank_transfer',null,null,'[]',2,'  Jack Elliott ');
  IF (SELECT race_sponsor_name FROM public.event_registrations WHERE id=reg)<>'Jack Elliott' THEN RAISE EXCEPTION 'Sponsor name not stored trimmed'; END IF;
  reg:=public.ndcc_register_event_snail_entry(ev,'Buyer','b@example.invalid','0400000000','pending_bank_transfer',null,null,
    '[{"snail_name":"Turbo","player_name":"Buyer"}]',0,'Ignored');
  IF (SELECT race_sponsor_name FROM public.event_registrations WHERE id=reg) IS NOT NULL THEN RAISE EXCEPTION 'Sponsor name stored without a sponsorship'; END IF;
  -- The previous 9-argument signature still works (no sponsor name).
  reg:=public.ndcc_register_event_snail_entry(ev,'Buyer','b@example.invalid','0400000000','pending_bank_transfer',null,null,'[]',1);
  IF (SELECT race_sponsorships FROM public.event_registrations WHERE id=reg)<>1 THEN RAISE EXCEPTION 'Wrapper did not register'; END IF;
  BEGIN
    PERFORM public.ndcc_register_event_snail_entry(ev,'F','f@example.invalid','0400000000','pending_bank_transfer',null,null,'[]',1,repeat('x',41));
    RAISE EXCEPTION '41-character sponsor name accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  IF has_function_privilege('anon', 'public.ndcc_register_event_snail_entry(uuid,text,text,text,text,text,uuid,jsonb,integer,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Public roles can call the snail entry function';
  END IF;
END $$;
ROLLBACK;
