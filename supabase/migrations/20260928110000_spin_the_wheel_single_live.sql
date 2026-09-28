-- Spin the Wheel follow-up (review on #278):
--   * Only one wheel may be live at a time. The public page, balances, spins
--     and checkout all use the single public wheel, so a second live wheel
--     would strand its spin links and paid spins.
--   * Free spins follow the wheel's current allowance: an account may hold
--     (free_spins_per_account - free spins already used) unused free spins.
--     Lowering the allowance revokes the surplus (used spins stay on record);
--     raising it again restores them.
--
-- Rollback:
--   begin;
--   drop index public.spin_wheels_single_live;
--   -- then re-run the ensure_spin_wheel_free_entitlements definition from
--   -- 20260928100000_spin_the_wheel.sql
--   commit;
begin;
set local lock_timeout = '3s';

create unique index spin_wheels_single_live on public.spin_wheels ((true)) where status = 'live';

create or replace function public.ensure_spin_wheel_free_entitlements(target_wheel uuid, target_user uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  allowance integer;
  used_count integer;
  keep integer;
  added integer := 0;
begin
  if target_user is null then return 0; end if;
  select free_spins_per_account into allowance from public.spin_wheels
    where id = target_wheel and status in ('live','paused');
  if allowance is null then return 0; end if;
  if allowance > 0 then
    insert into public.spin_wheel_entitlements (wheel_id, auth_user_id, source, seq)
      select target_wheel, target_user, 'free', slot from generate_series(1, allowance) as slot
      on conflict (wheel_id, auth_user_id, seq) where source = 'free' do nothing;
    get diagnostics added = row_count;
  end if;
  -- The account may hold (allowance - free spins already used) unused free
  -- spins: keep the lowest slots open, revoke the rest.
  select count(*) into used_count from public.spin_wheel_entitlements
    where wheel_id = target_wheel and auth_user_id = target_user and source = 'free' and used_at is not null;
  keep := greatest(allowance - used_count, 0);
  update public.spin_wheel_entitlements set revoked_at = null
    where revoked_at is not null and id in (
      select e.id from public.spin_wheel_entitlements e
      where e.wheel_id = target_wheel and e.auth_user_id = target_user and e.source = 'free' and e.used_at is null
      order by e.seq limit keep);
  update public.spin_wheel_entitlements set revoked_at = now()
    where revoked_at is null and id in (
      select e.id from public.spin_wheel_entitlements e
      where e.wheel_id = target_wheel and e.auth_user_id = target_user and e.source = 'free' and e.used_at is null
      order by e.seq offset keep);
  return added;
end $$;
revoke all on function public.ensure_spin_wheel_free_entitlements(uuid,uuid) from public, anon, authenticated;
grant execute on function public.ensure_spin_wheel_free_entitlements(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
