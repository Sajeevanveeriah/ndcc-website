-- Transaction-only fixtures, including when run against the live schema.
BEGIN;
DO $$
DECLARE sid uuid; mid uuid; aid uuid; rid uuid; oid uuid; paid uuid; p uuid; squad uuid;
  picks jsonb:='[]'; v timestamptz; initial_complete timestamptz; result jsonb; n int;
  keys text[]:=array['XI_BAT_1','XI_BAT_2','XI_BAT_3','XI_BAT_4','XI_AR_1','XI_AR_2','XI_WK_1','XI_BOWL_1','XI_BOWL_2','XI_BOWL_3','XI_BOWL_4','BENCH_BAT_1','BENCH_AR_1','BENCH_WK_1','BENCH_BOWL_1'];
BEGIN
 insert into public.committee_users(email,full_name,password_hash,role,cms_permissions) values(gen_random_uuid()||'@example.invalid','Lifecycle test admin','not-a-login','admin','{}') returning id into aid;
 insert into public.committee_users(email,full_name,password_hash,role,cms_permissions) values(gen_random_uuid()||'@example.invalid','Lifecycle test reviewer','not-a-login','committee',array['fantasy.home']) returning id into rid;
 insert into public.fantasy_seasons(name,slug,is_public,auto_sync_enabled) values('Lifecycle test','lifecycle-'||gen_random_uuid(),false,false) returning id into sid;
 insert into public.fantasy_dino_settings(season_id,pilot_notice,slot_counts,scoring_config,budget_dino_dollars,public_launch_enabled,team_selection_open,rules_version,notification_recipients)
 values(sid,'Isolated test','{}','{}',10000000,true,true,'test',array['test@example.invalid']);
 insert into public.fantasy_managers(display_name,email,team_name,age_verified_at,team_name_status,rules_version_accepted)
 values('Lifecycle test',gen_random_uuid()||'@example.invalid','Lifecycle test',now(),'approved','test') returning id,updated_at into mid,v;
 insert into public.fantasy_entries(manager_id,season_id,entry_fee_cents,fee_waived,fee_waiver_reason,fee_waived_by,fee_waived_at) values(mid,sid,2500,true,'Test waiver',aid,now());
 for n in 1..15 loop
  insert into public.fantasy_players(display_name,role) values('Lifecycle player '||gen_random_uuid(),'BAT') returning id into p;
  insert into public.fantasy_season_players(season_id,player_id,role,active,selectable,stats_status) values(sid,p,'BAT',true,true,'unrated');
  insert into public.fantasy_player_prices(season_id,player_id,price_dino_dollars,price_million,published_at) values(sid,p,100000,0.1,now());
  picks:=picks||jsonb_build_array(jsonb_build_object('player_id',p,'slot_key',keys[n],'assigned_role',split_part(keys[n],'_',2),'position_type',case when n<=11 then 'starter' else 'bench' end,'is_captain',n=1,'is_vice_captain',n=2));
 end loop;

 -- Restrict the reminder scan to this rollback-only season.
 update public.fantasy_seasons set is_current=false where is_current;
 update public.fantasy_seasons set is_current=true where id=sid;
 update public.fantasy_managers set initial_squad_due_at=now()+interval '4 days' where id=mid;
 perform public.queue_dino_initial_reminders(); perform public.queue_dino_initial_reminders();
 if (select count(*) from public.fantasy_notification_jobs where manager_id=mid and kind='reminder')<>1 then raise exception 'Daily reminders duplicated or absent'; end if;
 update public.fantasy_managers set initial_squad_due_at=now() where id=mid;
 perform public.queue_dino_initial_reminders(); perform public.queue_dino_initial_reminders();
 if (select count(*) from public.fantasy_notification_jobs where manager_id=mid and kind='expired')<>1 then raise exception 'Expiry notices duplicated or absent'; end if;
 update public.fantasy_managers set initial_squad_due_at=now()-interval '1 second' where id=mid;
 begin perform public.save_dino_coach_squad(mid,sid,null,'submitted',1500000,picks); raise exception 'Expired manager saved a squad'; exception when check_violation then null; end;
 select updated_at into v from public.fantasy_managers where id=mid;
 result:=public.admin_edit_dino_manager(mid,sid,rid,v,'{"reactivate":true}',null,null,'draft',0,'Reactivation test');
 if (select initial_squad_due_at from public.fantasy_managers where id=mid)<>now()+interval '5 days' then raise exception 'Reactivation did not grant five days'; end if;
 squad:=public.save_dino_coach_squad(mid,sid,null,'submitted',1500000,picks);
 select first_squad_completed_at into initial_complete from public.fantasy_managers where id=mid;
 if initial_complete is null then raise exception 'Initial completion was not recorded'; end if;
 update public.fantasy_managers set initial_squad_due_at=now()-interval '30 days' where id=mid;
 perform public.save_dino_coach_squad(mid,sid,null,'draft',100000,jsonb_build_array(picks->0));
 if (select first_squad_completed_at from public.fantasy_managers where id=mid) is distinct from initial_complete then raise exception 'Completion reset after reducing the squad'; end if;
 if exists(select 1 from public.fantasy_entries where manager_id=mid and (status='paid' or paid_at is not null or is_demo)) then raise exception 'Waiver fabricated payment or demo status'; end if;
 if exists(select 1 from public.receipt_delivery_jobs j join public.fantasy_entries e on e.id=j.dino_entry_id where e.manager_id=mid) then raise exception 'Waiver generated a payment receipt'; end if;
 select updated_at into v from public.fantasy_managers where id=mid;
 update public.fantasy_dino_settings set team_selection_open=false where season_id=sid;
 result:=public.admin_edit_dino_manager(mid,sid,rid,v,'{"team_name":"Corrected team"}',picks,null,'submitted',1500000,'Correct squad during lock');
 if (select count(*) from public.fantasy_squad_players where squad_id=squad)<>15 then raise exception 'Admin squad did not save'; end if;
 if not exists(select 1 from public.fantasy_notification_jobs where manager_id=mid and event_key='admin:'||(result->>'event_id')) then raise exception 'Admin edit lost its email'; end if;
 begin perform public.admin_edit_dino_manager(mid,sid,rid,v-interval '1 second','{}',null,null,'draft',0,'Stale edit'); raise exception 'Stale edit accepted'; exception when serialization_failure then null; end;
 begin perform public.admin_edit_dino_manager(mid,sid,rid,v,'{"deleted":true}',null,null,'draft',0,'Forbidden delete'); raise exception 'Reviewer deleted a team'; exception when others then if sqlerrm='Reviewer deleted a team' then raise; end if; end;
 select updated_at into v from public.fantasy_managers where id=mid;
 result:=public.admin_edit_dino_manager(mid,sid,aid,v,'{"deleted":true}',null,null,'draft',0,'Delete test');
 if not exists(select 1 from public.fantasy_managers where id=mid and deleted_at is not null and not is_active) then raise exception 'Team not deleted'; end if;
 select updated_at into v from public.fantasy_managers where id=mid;
 result:=public.admin_edit_dino_manager(mid,sid,aid,v,'{"deleted":false,"is_active":true}',null,null,'draft',0,'Restore test');
 if not exists(select 1 from public.fantasy_managers where id=mid and deleted_at is null and is_active) then raise exception 'Team not restored'; end if;
 insert into public.orders(customer_name,customer_email,items,total_amount,payment_status,processed) values('Lifecycle test',gen_random_uuid()||'@example.invalid','[]',10,'paid',true) returning id into oid;
 perform public.set_order_deleted(oid,'orders',true,aid,'DELETE ORDER');
 if not exists(select 1 from public.orders where id=oid and processed and deleted_at is not null) then raise exception 'Processed order not deleted'; end if;
 perform public.set_order_deleted(oid,'orders',false,aid,'');
 if not exists(select 1 from public.orders where id=oid and deleted_at is null) then raise exception 'Order not restored'; end if;
 if has_function_privilege('authenticated','public.admin_edit_dino_manager(uuid,uuid,uuid,timestamptz,jsonb,jsonb,uuid,text,bigint,text)','EXECUTE') or has_table_privilege('authenticated','public.fantasy_notification_jobs','SELECT') or has_column_privilege('authenticated','public.fantasy_entries','fee_waived','UPDATE') then raise exception 'Browser permissions are unsafe'; end if;
END $$;
ROLLBACK;
