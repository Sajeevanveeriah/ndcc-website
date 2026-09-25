begin;
-- Optional member choices, separate from membership status and fantasy records.
create table public.club_account_preferences (
 member_id uuid primary key references public.club_members(id) on delete cascade,
 interests text[] not null default '{}' check(interests <@ array['club_news','senior_cricket','junior_cricket','womens_cricket','social_events','fundraising']::text[] and array_position(interests,null) is null),
 volunteering text[] not null default '{}' check(volunteering <@ array['events','canteen','scoring','coaching','grounds','sponsorship']::text[] and array_position(volunteering,null) is null),
 email_updates boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.club_account_preferences enable row level security;
revoke all on public.club_account_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.club_account_preferences to service_role;
notify pgrst,'reload schema';
commit;
