-- Clear Dino Coach sign-in links when a Supabase Auth user is deleted (WP5).
--
-- fantasy_managers.auth_user_id has no foreign key, and existing rows may
-- already point at deleted auth users, so adding a validated FK could fail.
-- Instead, an AFTER DELETE trigger on auth.users sets the link to null, which
-- matches club_members (on delete set null). The manager row, squads, scores
-- and payments are kept; only the dangling sign-in link is removed, so a new
-- account with the same id can never inherit the team.
-- Existing orphan links are deliberately left untouched for administrator review.
--
-- Rollback:
--   begin;
--   drop trigger if exists ndcc_clear_fantasy_manager_auth_user on auth.users;
--   drop function if exists public.ndcc_clear_fantasy_manager_auth_user();
--   commit;
begin;
set local lock_timeout = '3s';

create or replace function public.ndcc_clear_fantasy_manager_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fantasy_managers set auth_user_id = null, updated_at = now() where auth_user_id = old.id;
  return old;
end;
$$;

revoke all on function public.ndcc_clear_fantasy_manager_auth_user() from public, anon, authenticated;

drop trigger if exists ndcc_clear_fantasy_manager_auth_user on auth.users;
create trigger ndcc_clear_fantasy_manager_auth_user
  after delete on auth.users
  for each row execute function public.ndcc_clear_fantasy_manager_auth_user();

commit;
