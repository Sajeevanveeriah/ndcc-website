-- Club account deletion requests (WP5).
-- A signed-in member can ask the club to delete their account. The request is
-- recorded here and the committee actions it manually; orders, payments,
-- raffle records and other ledger data are never deleted by this table.
--
-- Rollback:
--   begin;
--   drop table if exists public.club_account_deletion_requests;
--   notify pgrst,'reload schema';
--   commit;
begin;
set local lock_timeout = '3s';
create table public.club_account_deletion_requests (
 id uuid primary key default gen_random_uuid(),
 member_id uuid references public.club_members(id) on delete set null,
 auth_user_id uuid references auth.users(id) on delete set null,
 email text not null check(length(email) between 3 and 254),
 reason text check(reason is null or length(reason) <= 1000),
 status text not null default 'pending' check(status in ('pending','actioned')),
 created_at timestamptz not null default now(),
 actioned_at timestamptz,
 actioned_by uuid references public.committee_users(id) on delete set null,
 check((status = 'pending' and actioned_at is null) or (status = 'actioned' and actioned_at is not null))
);
-- One open request per sign-in at a time.
create unique index club_account_deletion_requests_one_pending_idx
 on public.club_account_deletion_requests(auth_user_id) where status = 'pending';
create index club_account_deletion_requests_status_idx on public.club_account_deletion_requests(status, created_at desc);
create index club_account_deletion_requests_member_idx on public.club_account_deletion_requests(member_id);
create index club_account_deletion_requests_actioned_by_idx on public.club_account_deletion_requests(actioned_by);
alter table public.club_account_deletion_requests enable row level security;
revoke all on public.club_account_deletion_requests from public,anon,authenticated;
grant select,insert,update on public.club_account_deletion_requests to service_role;
notify pgrst,'reload schema';
commit;
