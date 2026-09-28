-- Complimentary entry for any manager, administrator only (CMS Manager review).
-- admin_edit_dino_manager could only waive the fee on an existing entry row, so a
-- manager who never started checkout could not be made complimentary. Granting
-- complimentary entry now creates the season entry when none exists, recorded in
-- the same audit event and manager notice (the new-registration welcome, written for
-- CMS-created accounts, is not sent). The administrator-only check and the
-- pending Stripe checkout guard are unchanged; squad edits still need an entry.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $migration$
DECLARE source text; revised text;
  old_guard text := '  if (p_selection is not null or p_changes ? ''fee_waived'') and not exists(select 1 from public.fantasy_entries where manager_id=p_manager and season_id=p_season) then raise exception ''No registration exists for this season.''; end if;';
  new_guard text := '  if p_selection is not null and not exists(select 1 from public.fantasy_entries where manager_id=p_manager and season_id=p_season) then raise exception ''No registration exists for this season.''; end if;';
  old_waiver text := '    update public.fantasy_entries set fee_waived=(p_changes->>''fee_waived'')::boolean,';
  new_waiver text := '    if (p_changes->>''fee_waived'')::boolean and not exists(select 1 from public.fantasy_entries where manager_id=p_manager and season_id=p_season) then
      insert into public.fantasy_entries(manager_id,season_id,entry_fee_cents,currency,fee_waived,fee_waiver_reason,fee_waived_by,fee_waived_at)
        select p_manager,p_season,cfg.entry_fee_cents,cfg.entry_fee_currency,true,p_reason,p_actor,now()
        from public.fantasy_dino_settings cfg where cfg.season_id=p_season;
      if not found then raise exception ''Season settings unavailable.''; end if;
      -- The entry trigger queues the new-registration welcome, whose complimentary copy refers to an
      -- administrator-supplied password. This manager already has an account; the admin-change
      -- notice below tells them about the complimentary entry instead.
      delete from public.fantasy_registration_emails r using public.fantasy_entries e
        where r.entry_id=e.id and e.manager_id=p_manager and e.season_id=p_season and r.sent_at is null;
    end if;
    update public.fantasy_entries set fee_waived=(p_changes->>''fee_waived'')::boolean,';
BEGIN
  SELECT pg_get_functiondef('public.admin_edit_dino_manager(uuid,uuid,uuid,timestamptz,jsonb,jsonb,uuid,text,bigint,text)'::regprocedure) INTO source;
  IF strpos(source, old_guard) = 0 OR strpos(source, old_waiver) = 0 THEN
    RAISE EXCEPTION 'Unexpected admin_edit_dino_manager definition; no changes applied.';
  END IF;
  revised := replace(replace(source, old_guard, new_guard), old_waiver, new_waiver);
  EXECUTE revised;
END $migration$;

COMMIT;

-- Rollback, after reverting the CMS change (entries already created stay; they
-- are ordinary complimentary entries and can be un-waived in the CMS):
-- DO $rollback$
-- DECLARE source text;
-- BEGIN
--   SELECT pg_get_functiondef('public.admin_edit_dino_manager(uuid,uuid,uuid,timestamptz,jsonb,jsonb,uuid,text,bigint,text)'::regprocedure) INTO source;
--   source := replace(source,
--     '  if p_selection is not null and not exists(select 1 from public.fantasy_entries where manager_id=p_manager and season_id=p_season) then raise exception ''No registration exists for this season.''; end if;',
--     '  if (p_selection is not null or p_changes ? ''fee_waived'') and not exists(select 1 from public.fantasy_entries where manager_id=p_manager and season_id=p_season) then raise exception ''No registration exists for this season.''; end if;');
--   source := regexp_replace(source,
--     '    if \(p_changes->>''fee_waived''\)::boolean and not exists.*?    end if;\n(    update public.fantasy_entries set fee_waived=)', '\1');
--   EXECUTE source;
-- END $rollback$;
