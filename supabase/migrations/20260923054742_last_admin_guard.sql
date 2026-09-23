-- Keep at least one active CMS administrator, atomically.
--
-- The users API checks the active-admin count before demoting or deactivating
-- an admin, but two concurrent requests could both pass that check. This
-- trigger serialises such changes with a transaction advisory lock and
-- re-counts committed active admins, so the last one can never be removed.
--
-- Rollback:
--   drop trigger if exists committee_users_last_admin_guard on public.committee_users;
--   drop function if exists public.ndcc_guard_last_active_admin();

begin;

create or replace function public.ndcc_guard_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining integer;
begin
  if old.role is distinct from 'admin' or old.is_active is not true then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'admin' and new.is_active is true then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ndcc_last_active_admin'));

  select count(*)::integer into v_remaining
    from public.committee_users u
    where u.role = 'admin' and u.is_active is true and u.id <> old.id;

  if v_remaining = 0 then
    raise exception 'At least one active administrator must remain.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.ndcc_guard_last_active_admin() from public, anon, authenticated;

drop trigger if exists committee_users_last_admin_guard on public.committee_users;
create trigger committee_users_last_admin_guard
  before update of role, is_active or delete on public.committee_users
  for each row execute function public.ndcc_guard_last_active_admin();

commit;
