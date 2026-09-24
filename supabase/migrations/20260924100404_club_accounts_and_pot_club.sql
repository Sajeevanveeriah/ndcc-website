begin;
-- Private contact records; account ownership never confers CMS permissions.
create table public.club_members (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid unique references auth.users(id) on delete set null,
 full_name text not null check(length(trim(full_name)) between 1 and 120),
 email text not null check(length(email) between 3 and 254),
 phone text not null default '' check(length(phone)<=40),
 member_type text not null check(member_type in ('player','social','both')),
 membership_status text not null default 'pending' check(membership_status in ('pending','active','inactive')),
 privacy_accepted_at timestamptz,
 created_by uuid references public.committee_users(id),
 reviewed_by uuid references public.committee_users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.club_members enable row level security;
revoke all on public.club_members from public,anon,authenticated;
grant all on public.club_members to service_role;
create index club_members_email_idx on public.club_members(lower(email));
create index club_members_reviewed_by_idx on public.club_members(reviewed_by);
create index club_members_created_by_idx on public.club_members(created_by);
-- Source records remain distinct: a shared family email is not an identity match.
-- Existing and future applications appear immediately without copying private data.
create view public.club_member_directory with (security_invoker=true) as
 select 'club_account'::text source,id,full_name,email,phone,member_type,membership_status status,created_at from public.club_members
 union all
 select 'social_application',m.id,m.full_name,m.email,coalesce(m.phone,''),'social',m.status,m.created_at from public.member_applications m
 union all
 select 'dino_coach',f.id,f.display_name,f.email,''::text,'competition',case when f.is_active then 'active' else 'inactive' end,f.created_at from public.fantasy_managers f where f.deleted_at is null;
revoke all on public.club_member_directory from public,anon,authenticated;
grant select on public.club_member_directory to service_role;

alter table public.social_membership_plans add column product_code text unique;
insert into public.social_membership_plans(name,description,price,is_active,sort_order,product_code)
values('Pot Club 2026/2027','An engraved pot glass and 50 cents off drinks for the season, including spirits, wine, soft drinks, cider and beer.',100,true,2,'pot_club_2026_27');
-- Registration has no mid-season cut-off. Administrators retain an emergency pause.
update public.fantasy_dino_settings set registration_open=true where season_id in(select id from public.fantasy_seasons where is_current and status='active');
update public.fantasy_settings set is_registration_open=true where season_id in(select id from public.fantasy_seasons where is_current and status='active');
update public.fantasy_seasons set registration_open=true where is_current and status='active';
notify pgrst,'reload schema';
commit;
