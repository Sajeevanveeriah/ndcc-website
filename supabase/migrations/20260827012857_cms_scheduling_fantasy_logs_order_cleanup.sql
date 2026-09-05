-- Rollback: drop the three RPCs and indexes below, then restore the previous
-- protect_order_payment_history() definition from 20260716050000_payment_ledger.sql.

create index if not exists news_public_schedule_idx
  on public.news (published_at desc) where published = true;
create index if not exists publications_public_schedule_idx
  on public.publications (published_at desc) where published = true;

-- Completed and archived seasons are historical reference data. Preserve all
-- records, but remove them from automatic production sync immediately.
update public.fantasy_seasons
set auto_sync_enabled = false,
    updated_at = now()
where status in ('completed', 'archived')
  and auto_sync_enabled = true;

create or replace function public.protect_order_payment_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('settled', 'refunded')
       and coalesce(current_setting('ndcc.allow_test_order_cleanup', true), '') <> 'on' then
      raise exception 'Settled or refunded payments cannot be deleted; record a reversing payment instead.';
    end if;
    return old;
  end if;
  if old.status in ('settled', 'refunded') then
    if new.amount is distinct from old.amount
       or new.order_id is distinct from old.order_id
       or new.method is distinct from old.method
       or new.currency is distinct from old.currency
       or new.status is distinct from old.status
       or new.provider_event_id is distinct from old.provider_event_id then
      raise exception 'Settled or refunded payments are immutable; record a reversing payment instead.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.preview_test_order_cleanup(p_order_id uuid)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'order', to_jsonb(o),
    'eligible_test_record', lower(coalesce(o.notes,'')) ~ '(dummy|test)' or lower(coalesce(o.payment_reference,'')) ~ '(dummy|test)',
    'dependencies', jsonb_build_object(
      'order_payments', (select count(*) from order_payments where order_id=o.id),
      'bank_transfer_confirmations', (select count(*) from bank_transfer_confirmations where order_id=o.id),
      'event_registrations', (select count(*) from event_registrations where order_id=o.id),
      'kitchen_orders', (select count(*) from kitchen_orders where linked_order_id=o.id),
      'member_applications', (select count(*) from member_applications where order_id=o.id),
      'imported_transactions', (select count(*) from imported_transactions where matched_order_id=o.id)
    )
  ) from orders o where o.id=p_order_id;
$$;

create or replace function public.delete_test_order_atomic(p_order_id uuid, p_confirmation text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare o orders%rowtype; result jsonb;
begin
  if p_confirmation <> 'DELETE TEST ORDER' then raise exception 'Typed confirmation is incorrect.'; end if;
  select * into o from orders where id=p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if not (lower(coalesce(o.notes,'')) ~ '(dummy|test)' or lower(coalesce(o.payment_reference,'')) ~ '(dummy|test)') then
    raise exception 'Order is not explicitly marked as dummy/test.';
  end if;
  result := preview_test_order_cleanup(p_order_id);
  perform set_config('ndcc.allow_test_order_cleanup','on',true);
  update event_registrations set order_id=null where order_id=p_order_id;
  update kitchen_orders set linked_order_id=null where linked_order_id=p_order_id;
  update imported_transactions set matched_order_id=null where matched_order_id=p_order_id;
  update member_applications set order_id=null where order_id=p_order_id;
  delete from bank_transfer_confirmations where order_id=p_order_id;
  delete from order_payments where order_id=p_order_id;
  delete from orders where id=p_order_id;
  return result || jsonb_build_object('deleted',true,'order_id',p_order_id);
end;
$$;

create or replace function public.preview_fantasy_operational_log_clear(p_season_id uuid default null)
returns jsonb language sql security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object('sync_runs',count(*),'season_id',p_season_id)
  from fantasy_sync_runs where p_season_id is null or season_id=p_season_id;
$$;

create or replace function public.clear_fantasy_operational_logs(p_season_id uuid, p_confirmation text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare removed bigint;
begin
  if p_confirmation <> 'CLEAR LOGS' then raise exception 'Typed confirmation is incorrect.'; end if;
  delete from fantasy_sync_runs where p_season_id is null or season_id=p_season_id;
  get diagnostics removed=row_count;
  update fantasy_sync_health set last_error=null,next_retry_at=null,updated_at=now()
    where p_season_id is null or season_id=p_season_id;
  return jsonb_build_object('deleted_sync_runs',removed,'season_id',p_season_id);
end;
$$;

revoke all on function public.preview_test_order_cleanup(uuid) from public,anon,authenticated;
revoke all on function public.delete_test_order_atomic(uuid,text) from public,anon,authenticated;
revoke all on function public.preview_fantasy_operational_log_clear(uuid) from public,anon,authenticated;
revoke all on function public.clear_fantasy_operational_logs(uuid,text) from public,anon,authenticated;
grant execute on function public.preview_test_order_cleanup(uuid) to service_role;
grant execute on function public.delete_test_order_atomic(uuid,text) to service_role;
grant execute on function public.preview_fantasy_operational_log_clear(uuid) to service_role;
grant execute on function public.clear_fantasy_operational_logs(uuid,text) to service_role;
