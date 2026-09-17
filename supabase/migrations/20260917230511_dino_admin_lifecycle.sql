-- Additive rollout. Roll back application code first; retain audit/outbox data.
-- Existing complete squads are permanently exempt from the initial deadline.
alter table public.fantasy_managers
  add column initial_squad_due_at timestamptz not null default (now() + interval '5 days'),
  add column first_squad_completed_at timestamptz,
  add column hidden_at timestamptz,
  add column deleted_at timestamptz;
update public.fantasy_managers set initial_squad_due_at = created_at + interval '5 days';
update public.fantasy_managers m set first_squad_completed_at = s.completed_at
from (select manager_id, min(updated_at) completed_at from public.fantasy_squads s
  where (select count(*) from public.fantasy_squad_players p where p.squad_id=s.id)=15
  group by manager_id) s where m.id=s.manager_id;

alter table public.fantasy_entries
  add column fee_waived boolean not null default false,
  add column fee_waiver_reason text,
  add column fee_waived_by uuid,
  add column fee_waived_at timestamptz,
  add constraint fantasy_fee_waiver_evidence check (not fee_waived or
    (nullif(trim(fee_waiver_reason),'') is not null and fee_waived_by is not null and fee_waived_at is not null));
comment on column public.fantasy_entries.fee_waived is 'Admin-approved complimentary entry. This is not a payment or a demo entry.';

alter table public.fantasy_dino_settings add column initial_reminders_enabled boolean not null default true;
-- Resolve the requested reactivation contacts from their existing active CMS records.
update public.fantasy_dino_settings set notification_recipients = array(
  select email from public.committee_users where is_active and ((full_name='Sajeevan Veeriah' and role='admin') or full_name='Rick McHutchison')
  order by email
) where cardinality(notification_recipients)=0;

create table public.fantasy_admin_events (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.fantasy_managers(id),
  actor_id uuid not null references public.committee_users(id),
  action text not null,
  reason text not null check(length(trim(reason)) between 1 and 1000),
  changes jsonb not null,
  created_at timestamptz not null default now()
);
create table public.fantasy_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.fantasy_managers(id),
  season_id uuid not null references public.fantasy_seasons(id),
  event_key text not null unique,
  kind text not null check(kind in ('admin_change','reminder','expired','manual_registration')),
  payload jsonb not null default '{}'::jsonb,
  delivery jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  cancelled_at timestamptz,
  provider_message_id text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text
);
create index fantasy_notification_due on public.fantasy_notification_jobs(next_attempt_at)
  where sent_at is null and cancelled_at is null;
alter table public.fantasy_admin_events enable row level security;
alter table public.fantasy_notification_jobs enable row level security;
revoke all on public.fantasy_admin_events,public.fantasy_notification_jobs from public,anon,authenticated;
grant select,insert on public.fantasy_admin_events to service_role;
grant select,insert,update on public.fantasy_notification_jobs to service_role;

create function public.queue_dino_initial_reminders() returns integer
language plpgsql set search_path='' as $$
declare inserted integer;
begin
  insert into public.fantasy_notification_jobs(manager_id,season_id,event_key,kind,payload)
  select m.id,e.season_id,
    'initial:'||m.id||':'||m.initial_squad_due_at::text||':'||
      case when now()>=m.initial_squad_due_at then 'expired' else floor(extract(epoch from (now()-(m.initial_squad_due_at-interval '5 days')))/86400)::text end,
    case when now()>=m.initial_squad_due_at then 'expired' else 'reminder' end,
    jsonb_build_object('due_at',m.initial_squad_due_at)
  from public.fantasy_managers m
  join public.fantasy_entries e on e.manager_id=m.id
  join public.fantasy_seasons s on s.id=e.season_id and s.is_current
  join public.fantasy_dino_settings cfg on cfg.season_id=e.season_id and cfg.initial_reminders_enabled
  where m.first_squad_completed_at is null and m.deleted_at is null and m.is_active
    and now()>=m.initial_squad_due_at-interval '4 days'
  on conflict(event_key) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end; $$;

create function public.claim_dino_notification() returns setof public.fantasy_notification_jobs
language sql set search_path='' as $$
  update public.fantasy_notification_jobs set attempts=attempts+1,lease_until=now()+interval '5 minutes'
  where id=(select id from public.fantasy_notification_jobs
    where sent_at is null and cancelled_at is null and next_attempt_at<=now()
      and (lease_until is null or lease_until<now())
    order by next_attempt_at,created_at for update skip locked limit 1)
  returning *;
$$;
revoke all on function public.queue_dino_initial_reminders(),public.claim_dino_notification() from public,anon,authenticated;
grant execute on function public.queue_dino_initial_reminders(),public.claim_dino_notification() to service_role;

-- Deleting an operational order is reversible and never erases its ledger.
alter table public.orders add column deleted_at timestamptz, add column deleted_by uuid;
alter table public.kitchen_orders add column deleted_at timestamptz, add column deleted_by uuid;
create function public.set_order_deleted(p_id uuid,p_resource text,p_deleted boolean,p_actor uuid,p_confirmation text)
returns uuid language plpgsql set search_path='' as $$
declare changed uuid; linked uuid;
begin
  if not exists(select 1 from public.committee_users where id=p_actor and role='admin' and is_active) then
    raise exception 'Admin access required.';
  end if;
  if p_deleted and p_confirmation is distinct from 'DELETE ORDER' then raise exception 'Type DELETE ORDER to confirm.'; end if;
  if p_resource='orders' then
    update public.orders set deleted_at=case when p_deleted then now() end,deleted_by=case when p_deleted then p_actor end
      where id=p_id returning id into changed;
    update public.kitchen_orders set deleted_at=case when p_deleted then now() end,deleted_by=case when p_deleted then p_actor end where linked_order_id=p_id;
  elsif p_resource='kitchenOrders' then
    update public.kitchen_orders set deleted_at=case when p_deleted then now() end,deleted_by=case when p_deleted then p_actor end
      where id=p_id returning id,linked_order_id into changed,linked;
    update public.orders set deleted_at=case when p_deleted then now() end,deleted_by=case when p_deleted then p_actor end where id=linked;
  else raise exception 'Unknown order resource.'; end if;
  if changed is null then raise exception 'Order not found.'; end if;
  return changed;
end; $$;
revoke all on function public.set_order_deleted(uuid,text,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.set_order_deleted(uuid,text,boolean,uuid,text) to service_role;

CREATE OR REPLACE FUNCTION public.save_dino_coach_squad(target_manager_id uuid, target_season_id uuid, target_round_id uuid, target_status text, target_budget_dino_dollars bigint, selected_players jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
  SET search_path TO ''
AS $function$
DECLARE
  cfg public.fantasy_dino_settings%ROWTYPE;
  target_squad_id UUID;
  expected_players INTEGER;
  actual_budget BIGINT;
  item_count INTEGER;
  invalid_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(target_manager_id::text || ':' || target_season_id::text,0));
  IF target_status NOT IN ('draft','submitted') OR jsonb_typeof(selected_players) <> 'array' THEN
    RAISE EXCEPTION 'Invalid Dino Coach squad request.' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO cfg FROM public.fantasy_dino_settings WHERE season_id=target_season_id FOR SHARE;
  IF NOT FOUND OR ((NOT cfg.public_launch_enabled OR NOT cfg.team_selection_open) AND coalesce(current_setting('ndcc.dino_admin_edit',true),'')<>'on') THEN
    RAISE EXCEPTION 'Dino Coach team selection is closed.' USING ERRCODE='check_violation';
  END IF;
  IF coalesce(current_setting('ndcc.dino_admin_edit',true),'')<>'on' AND NOT EXISTS (
    SELECT 1 FROM public.fantasy_managers m
    JOIN public.fantasy_entries e ON e.manager_id=m.id AND e.season_id=target_season_id AND (e.status='paid' OR e.is_demo OR e.fee_waived)
    WHERE m.id=target_manager_id AND m.age_verified_at IS NOT NULL
      AND m.team_name_status IN ('approved','replaced') AND m.rules_version_accepted=cfg.rules_version AND m.is_active AND m.deleted_at IS NULL
      AND (m.first_squad_completed_at IS NOT NULL OR now()<m.initial_squad_due_at)
  ) THEN RAISE EXCEPTION 'Dino Coach manager eligibility is incomplete.' USING ERRCODE='check_violation'; END IF;

  SELECT COUNT(*), COUNT(DISTINCT item->>'player_id'), COUNT(DISTINCT item->>'slot_key')
    INTO item_count, invalid_count, expected_players FROM jsonb_array_elements(selected_players) item;
  IF item_count > 15 OR item_count <> invalid_count OR item_count <> expected_players THEN
    RAISE EXCEPTION 'Dino Coach squad contains duplicate players or slots.' USING ERRCODE='check_violation';
  END IF;
  IF target_status='submitted' AND item_count<>15 THEN
    RAISE EXCEPTION 'Every Dino Coach squad slot must be filled.' USING ERRCODE='check_violation';
  END IF;

  WITH supplied AS (
    SELECT item, item->>'slot_key' slot_key, (item->>'player_id')::UUID player_id
    FROM jsonb_array_elements(selected_players) item
  ), valid_slots(slot_key, assigned_role, position_type) AS (VALUES
    ('XI_BAT_1','BAT','starter'),('XI_BAT_2','BAT','starter'),('XI_BAT_3','BAT','starter'),('XI_BAT_4','BAT','starter'),
    ('XI_AR_1','AR','starter'),('XI_AR_2','AR','starter'),('XI_WK_1','WK','starter'),
    ('XI_BOWL_1','BOWL','starter'),('XI_BOWL_2','BOWL','starter'),('XI_BOWL_3','BOWL','starter'),('XI_BOWL_4','BOWL','starter'),
    ('BENCH_BAT_1','BAT','bench'),('BENCH_AR_1','AR','bench'),('BENCH_WK_1','WK','bench'),('BENCH_BOWL_1','BOWL','bench')
  )
  SELECT COUNT(*) INTO invalid_count FROM supplied s
  LEFT JOIN valid_slots v ON v.slot_key=s.slot_key
  LEFT JOIN public.fantasy_season_players sp ON sp.season_id=target_season_id AND sp.player_id=s.player_id AND sp.active AND sp.selectable
  WHERE v.slot_key IS NULL OR sp.player_id IS NULL
    OR s.item->>'assigned_role' IS DISTINCT FROM v.assigned_role OR s.item->>'position_type' IS DISTINCT FROM v.position_type;
  IF invalid_count>0 THEN RAISE EXCEPTION 'Dino Coach squad has an invalid slot or player.' USING ERRCODE='check_violation'; END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(selected_players) item
    WHERE COALESCE((item->>'is_captain')::boolean,false) AND COALESCE((item->>'is_vice_captain')::boolean,false)) THEN
    RAISE EXCEPTION 'Captain and vice-captain must be different players.' USING ERRCODE='check_violation';
  END IF;
  IF target_status='submitted' THEN
    SELECT COUNT(*) INTO invalid_count FROM jsonb_array_elements(selected_players) item
      WHERE COALESCE((item->>'is_captain')::BOOLEAN,FALSE);
    IF invalid_count<>1 THEN RAISE EXCEPTION 'Exactly one captain is required.' USING ERRCODE='check_violation'; END IF;
    SELECT COUNT(*) INTO invalid_count FROM jsonb_array_elements(selected_players) item
      WHERE COALESCE((item->>'is_vice_captain')::BOOLEAN,FALSE);
    IF invalid_count<>1 THEN RAISE EXCEPTION 'Exactly one vice-captain is required.' USING ERRCODE='check_violation'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(selected_players) item
      WHERE (COALESCE((item->>'is_captain')::BOOLEAN,FALSE) OR COALESCE((item->>'is_vice_captain')::BOOLEAN,FALSE))
        AND item->>'position_type'<>'starter') THEN
      RAISE EXCEPTION 'Captain and vice-captain must be in the playing XI.' USING ERRCODE='check_violation';
    END IF;
  END IF;

  WITH chosen AS (SELECT (item->>'player_id')::UUID player_id FROM jsonb_array_elements(selected_players) item),
  latest AS (
    SELECT DISTINCT ON (p.player_id) p.player_id,p.price_dino_dollars
    FROM public.fantasy_player_prices p JOIN chosen c USING(player_id)
    WHERE p.season_id=target_season_id AND p.published_at IS NOT NULL AND p.price_dino_dollars>0
    ORDER BY p.player_id,p.created_at DESC
  ) SELECT COALESCE(SUM(price_dino_dollars),0),COUNT(*) INTO actual_budget,invalid_count FROM latest;
  IF invalid_count<>item_count THEN RAISE EXCEPTION 'Every selected player needs a positive published price.' USING ERRCODE='check_violation'; END IF;
  IF actual_budget>cfg.budget_dino_dollars OR actual_budget<>target_budget_dino_dollars THEN
    RAISE EXCEPTION 'Dino Coach squad budget or price evidence is invalid.' USING ERRCODE='check_violation';
  END IF;

  SELECT id INTO target_squad_id FROM public.fantasy_squads
  WHERE manager_id=target_manager_id AND season_id=target_season_id AND round_id IS NOT DISTINCT FROM target_round_id
  LIMIT 1 FOR UPDATE;
  IF target_squad_id IS NULL THEN
    INSERT INTO public.fantasy_squads(manager_id,season_id,round_id,status,budget_used,budget_used_dino_dollars)
    VALUES(target_manager_id,target_season_id,target_round_id,target_status,actual_budget/1000000.0,actual_budget)
    RETURNING id INTO target_squad_id;
  ELSE
    UPDATE public.fantasy_squads SET status=target_status,budget_used=actual_budget/1000000.0,
      budget_used_dino_dollars=actual_budget,updated_at=NOW() WHERE id=target_squad_id;
    DELETE FROM public.fantasy_squad_players WHERE squad_id=target_squad_id;
  END IF;
  INSERT INTO public.fantasy_squad_players(squad_id,player_id,position_type,bench_order,is_captain,is_vice_captain,slot_key,assigned_role,purchase_price_dino_dollars)
  SELECT target_squad_id,(item->>'player_id')::UUID,item->>'position_type',
    CASE WHEN item->>'position_type'='bench' THEN ROW_NUMBER() OVER (ORDER BY item->>'slot_key')::INTEGER ELSE NULL END,
    COALESCE((item->>'is_captain')::BOOLEAN,FALSE),COALESCE((item->>'is_vice_captain')::BOOLEAN,FALSE),
    item->>'slot_key',item->>'assigned_role',p.price_dino_dollars
  FROM jsonb_array_elements(selected_players) item
  JOIN LATERAL (SELECT price_dino_dollars FROM public.fantasy_player_prices
    WHERE season_id=target_season_id AND player_id=(item->>'player_id')::UUID AND published_at IS NOT NULL
    ORDER BY created_at DESC LIMIT 1) p ON TRUE;
  UPDATE public.fantasy_managers SET first_squad_completed_at=CASE WHEN item_count=15 THEN coalesce(first_squad_completed_at,now()) ELSE first_squad_completed_at END, updated_at=now() WHERE id=target_manager_id;
  RETURN target_squad_id;
END; $function$
;
CREATE OR REPLACE FUNCTION public.make_dino_coach_transfer(target_manager_id uuid, target_season_id uuid, target_round_id uuid, player_out uuid, player_in uuid)
 RETURNS uuid
 LANGUAGE plpgsql
  SET search_path TO ''
AS $function$
DECLARE target_squad_id UUID; transfer_id UUID; incoming_price BIGINT; outgoing_price BIGINT; current_budget BIGINT; next_budget BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(target_manager_id::TEXT||':'||target_season_id::TEXT,0));
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_managers m JOIN public.fantasy_entries e ON e.manager_id=m.id AND e.season_id=target_season_id JOIN public.fantasy_dino_settings cfg ON cfg.season_id=e.season_id
    WHERE m.id=target_manager_id AND m.is_active AND m.deleted_at IS NULL
    AND (m.first_squad_completed_at IS NOT NULL OR now()<m.initial_squad_due_at)
    AND (e.status='paid' OR e.is_demo OR e.fee_waived) AND m.age_verified_at IS NOT NULL
    AND m.team_name_status IN ('approved','replaced') AND m.rules_version_accepted=cfg.rules_version)
    THEN RAISE EXCEPTION 'Dino Coach eligibility is incomplete or the initial squad deadline has passed.'; END IF;
  IF NOT public.dino_coach_transfer_window_open(target_season_id,NOW()) THEN RAISE EXCEPTION 'Dino Coach transfer window is closed.' USING ERRCODE='check_violation'; END IF;
  IF player_in=player_out THEN RAISE EXCEPTION 'Choose a different incoming player.' USING ERRCODE='check_violation'; END IF;
  SELECT s.id,s.budget_used_dino_dollars INTO target_squad_id,current_budget FROM public.fantasy_squads s
    WHERE s.manager_id=target_manager_id AND s.season_id=target_season_id ORDER BY s.created_at DESC LIMIT 1 FOR UPDATE;
  IF target_squad_id IS NULL THEN RAISE EXCEPTION 'Submit a Dino Coach squad before making transfers.' USING ERRCODE='check_violation'; END IF;
  IF EXISTS(SELECT 1 FROM public.fantasy_squad_players WHERE squad_id=target_squad_id AND player_id=player_in) THEN RAISE EXCEPTION 'Incoming player is already in the squad.' USING ERRCODE='check_violation'; END IF;
  SELECT purchase_price_dino_dollars INTO outgoing_price FROM public.fantasy_squad_players WHERE squad_id=target_squad_id AND player_id=player_out FOR UPDATE;
  IF outgoing_price IS NULL THEN RAISE EXCEPTION 'Outgoing player is not in the squad.' USING ERRCODE='check_violation'; END IF;
  SELECT p.price_dino_dollars INTO incoming_price FROM public.fantasy_player_prices p
    JOIN public.fantasy_season_players sp ON sp.season_id=target_season_id AND sp.player_id=p.player_id AND sp.active AND sp.selectable
    WHERE p.season_id=target_season_id AND p.player_id=player_in AND p.published_at IS NOT NULL AND p.price_dino_dollars>0
    ORDER BY p.created_at DESC LIMIT 1;
  IF incoming_price IS NULL THEN RAISE EXCEPTION 'Incoming player has no positive published price.' USING ERRCODE='check_violation'; END IF;
  next_budget:=current_budget-outgoing_price+incoming_price;
  IF next_budget>(SELECT budget_dino_dollars FROM public.fantasy_dino_settings WHERE season_id=target_season_id) THEN RAISE EXCEPTION 'Transfer exceeds the Dino Dollar budget.' USING ERRCODE='check_violation'; END IF;
  UPDATE public.fantasy_squad_players SET player_id=player_in,purchase_price_dino_dollars=incoming_price WHERE squad_id=target_squad_id AND player_id=player_out;
  UPDATE public.fantasy_squads SET budget_used_dino_dollars=next_budget,budget_used=next_budget/1000000.0,updated_at=NOW() WHERE id=target_squad_id;
  INSERT INTO public.fantasy_transfers(manager_id,season_id,round_id,player_out_id,player_in_id,penalty_points)
    VALUES(target_manager_id,target_season_id,target_round_id,player_out,player_in,0) RETURNING id INTO transfer_id;
  UPDATE public.fantasy_managers SET updated_at=now() WHERE id=target_manager_id;
  RETURN transfer_id;
END; $function$
;

create function public.admin_edit_dino_manager(
  p_manager uuid,p_season uuid,p_actor uuid,p_expected_updated_at timestamptz,
  p_changes jsonb,p_selection jsonb,p_round uuid,p_status text,p_budget bigint,p_reason text
) returns jsonb language plpgsql set search_path='' as $$
declare m public.fantasy_managers%rowtype; actor_role text; event_id uuid; saved_squad_id uuid;
  before_state jsonb; after_state jsonb; changes jsonb; prior_squad jsonb; next_squad jsonb;
begin
  select role into actor_role from public.committee_users where id=p_actor and is_active and (role in ('admin','president','secretary','vice_president','treasurer','fantasy_manager') or 'fantasy.home'=any(cms_permissions));
  if actor_role is null then raise exception 'Active CMS operator required.'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' or length(trim(p_reason)) not between 1 and 1000 then raise exception 'A change reason is required.'; end if;
  if exists(select 1 from jsonb_object_keys(p_changes) k where k not in
    ('display_name','team_name','team_name_status','team_name_locked','is_active','hidden','deleted','reactivate','fee_waived')) then raise exception 'Unsupported manager change.'; end if;
  if actor_role<>'admin' and (p_changes ? 'deleted' or p_changes ? 'fee_waived') then raise exception 'Only the administrator can delete teams or waive entry fees.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_manager::text||':'||p_season::text,0));
  select * into m from public.fantasy_managers where id=p_manager for update;
  if not found then raise exception 'Manager not found.'; end if;
  if m.updated_at is distinct from p_expected_updated_at then raise exception 'This team changed since you opened it. Reload before saving.' using errcode='40001'; end if;
  if not exists(select 1 from public.fantasy_entries where manager_id=p_manager and season_id=p_season) then raise exception 'No registration exists for this season.'; end if;
  before_state := jsonb_build_object('display_name',m.display_name,'team_name',m.team_name,'team_name_status',m.team_name_status,
    'team_name_locked',m.team_name_locked,'is_active',m.is_active,'hidden_at',m.hidden_at,'deleted_at',m.deleted_at,'initial_squad_due_at',m.initial_squad_due_at,
    'fee_waived',(select fee_waived from public.fantasy_entries where manager_id=p_manager and season_id=p_season));
  if (p_changes ? 'display_name' and length(trim(p_changes->>'display_name')) not between 1 and 80)
    or (p_changes ? 'team_name' and length(trim(p_changes->>'team_name')) not between 1 and 80) then raise exception 'Names must contain 1 to 80 characters.'; end if;
  update public.fantasy_managers set
    display_name=coalesce(p_changes->>'display_name',display_name),team_name=coalesce(p_changes->>'team_name',team_name),
    team_name_status=coalesce(p_changes->>'team_name_status',team_name_status),
    team_name_locked=coalesce((p_changes->>'team_name_locked')::boolean,team_name_locked),
    is_active=case when (p_changes->>'deleted')::boolean then false else coalesce((p_changes->>'is_active')::boolean,is_active) end,
    hidden_at=case when p_changes ? 'hidden' then case when (p_changes->>'hidden')::boolean then coalesce(hidden_at,now()) end else hidden_at end,
    deleted_at=case when p_changes ? 'deleted' then case when (p_changes->>'deleted')::boolean then coalesce(deleted_at,now()) end else deleted_at end,
    initial_squad_due_at=case when (p_changes->>'reactivate')::boolean and first_squad_completed_at is null then now()+interval '5 days' else initial_squad_due_at end,
    updated_at=now() where id=p_manager;
  if p_changes ? 'fee_waived' then
    if (p_changes->>'fee_waived')::boolean and exists(select 1 from public.fantasy_entries where manager_id=p_manager and season_id=p_season and stripe_checkout_session_id is not null and status='pending') then
      raise exception 'Resolve the pending Stripe checkout before granting complimentary entry.';
    end if;
    update public.fantasy_entries set fee_waived=(p_changes->>'fee_waived')::boolean,
      fee_waiver_reason=p_reason,fee_waived_by=p_actor,fee_waived_at=now()
      where manager_id=p_manager and season_id=p_season;
  end if;
  if p_selection is not null then
    if p_round is not null and not exists(select 1 from public.fantasy_rounds where id=p_round and season_id=p_season) then raise exception 'Round does not belong to this season.'; end if;
    select coalesce(jsonb_agg(to_jsonb(p) - 'id' - 'squad_id' order by p.slot_key),'[]'::jsonb) into prior_squad
      from public.fantasy_squad_players p join public.fantasy_squads s on s.id=p.squad_id
      where s.manager_id=p_manager and s.season_id=p_season and s.round_id is not distinct from p_round;
    perform set_config('ndcc.dino_admin_edit','on',true);
    saved_squad_id := public.save_dino_coach_squad(p_manager,p_season,p_round,p_status,p_budget,p_selection);
    perform set_config('ndcc.dino_admin_edit','off',true);
    select coalesce(jsonb_agg(to_jsonb(p) - 'id' - 'squad_id' order by p.slot_key),'[]'::jsonb) into next_squad
      from public.fantasy_squad_players p where p.squad_id=saved_squad_id;
  end if;
  select jsonb_build_object('display_name',display_name,'team_name',team_name,'team_name_status',team_name_status,
    'team_name_locked',team_name_locked,'is_active',is_active,'hidden_at',hidden_at,'deleted_at',deleted_at,'initial_squad_due_at',initial_squad_due_at,
    'fee_waived',(select fee_waived from public.fantasy_entries where manager_id=p_manager and season_id=p_season)) into after_state
    from public.fantasy_managers where id=p_manager;
  select coalesce(jsonb_object_agg(key,jsonb_build_object('before',before_state->key,'after',value)),'{}'::jsonb) into changes
    from jsonb_each(after_state) where value is distinct from before_state->key;
  if p_selection is not null then changes:=changes||jsonb_build_object('squad',jsonb_build_object('before',prior_squad,'after',next_squad,'status',p_status,'round_id',p_round)); end if;
  if changes='{}'::jsonb then return jsonb_build_object('changed',false); end if;
  insert into public.fantasy_admin_events(manager_id,actor_id,action,reason,changes)
    values(p_manager,p_actor,'edit',p_reason,changes) returning id into event_id;
  insert into public.fantasy_notification_jobs(manager_id,season_id,event_key,kind,payload)
    values(p_manager,p_season,'admin:'||event_id,'admin_change',jsonb_build_object('reason',p_reason,'changes',changes));
  return jsonb_build_object('changed',true,'event_id',event_id,'squad_id',saved_squad_id);
end; $$;
revoke all on function public.admin_edit_dino_manager(uuid,uuid,uuid,timestamptz,jsonb,jsonb,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.admin_edit_dino_manager(uuid,uuid,uuid,timestamptz,jsonb,jsonb,uuid,text,bigint,text) to service_role;

create function public.admin_register_dino_manager(p_user uuid,p_actor uuid,p_season uuid,p_email text,p_name text,p_team text,p_dob date,p_reason text)
returns uuid language plpgsql set search_path='' as $$
declare manager_id uuid; cfg public.fantasy_dino_settings%rowtype; event_id uuid;
begin
  if not exists(select 1 from public.committee_users where id=p_actor and role='admin' and is_active) then raise exception 'Admin access required.'; end if;
  select * into cfg from public.fantasy_dino_settings where season_id=p_season;
  if not found then raise exception 'Season settings unavailable.'; end if;
  if p_dob is null or p_dob>(now() at time zone 'Australia/Melbourne')::date-make_interval(years=>cfg.minimum_age)
    then raise exception 'Participant does not meet the minimum age.'; end if;
  if length(trim(p_name)) not between 1 and 80 or length(trim(p_team)) not between 1 and 80 or length(trim(p_reason)) not between 1 and 1000 then raise exception 'Name, team and reason are required.'; end if;
  insert into public.fantasy_managers(auth_user_id,email,display_name,team_name,date_of_birth,age_verified_at,team_name_status,rules_version_accepted,rules_accepted_at)
    values(p_user,lower(p_email),trim(p_name),trim(p_team),p_dob,now(),'approved',cfg.rules_version,now()) returning id into manager_id;
  insert into public.fantasy_entries(manager_id,season_id,entry_fee_cents,currency,fee_waived,fee_waiver_reason,fee_waived_by,fee_waived_at)
    values(manager_id,p_season,cfg.entry_fee_cents,cfg.entry_fee_currency,true,p_reason,p_actor,now());
  insert into public.fantasy_admin_events(manager_id,actor_id,action,reason,changes)
    values(manager_id,p_actor,'registration',p_reason,jsonb_build_object('fee_waived',true)) returning id into event_id;
  -- The standard welcome queue sends the registration notice, without any password.
  return manager_id;
end; $$;
revoke all on function public.admin_register_dino_manager(uuid,uuid,uuid,text,text,text,date,text) from public,anon,authenticated;
grant execute on function public.admin_register_dino_manager(uuid,uuid,uuid,text,text,text,date,text) to service_role;

alter table public.fantasy_registration_emails add column delivery jsonb;
