-- Existing club-settings permissions also govern donation publication.
-- Default closed so a database rollout cannot publish an unfinished feature.
alter table public.club_settings
  add column if not exists donations_enabled boolean not null default false;
notify pgrst, 'reload schema';
