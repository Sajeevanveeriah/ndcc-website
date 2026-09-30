-- Site-wide maintenance banner (requested by Saj, 30 September 2026).
-- Set from Admin > Club & Contact Details. While switched on, every page
-- shows the maintenance times at the top: as advance notice before the start,
-- "in progress" from the start, and nothing after the end. Off by default, so
-- nothing changes until the CMS switches it on.
--
-- Rollback (after reverting the app code):
--   alter table public.club_settings drop constraint if exists club_settings_maintenance_window;
--   alter table public.club_settings drop constraint if exists club_settings_maintenance_message_length;
--   alter table public.club_settings drop constraint if exists club_settings_maintenance_start_required;
--   alter table public.club_settings drop column if exists maintenance_message,
--     drop column if exists maintenance_ends_at, drop column if exists maintenance_starts_at,
--     drop column if exists maintenance_banner_enabled;
alter table public.club_settings
  add column if not exists maintenance_banner_enabled boolean not null default false,
  add column if not exists maintenance_starts_at timestamptz,
  add column if not exists maintenance_ends_at timestamptz,
  add column if not exists maintenance_message text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'club_settings_maintenance_window' and conrelid = 'public.club_settings'::regclass) then
    alter table public.club_settings add constraint club_settings_maintenance_window
      check (maintenance_starts_at is null or maintenance_ends_at is null or maintenance_ends_at > maintenance_starts_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'club_settings_maintenance_message_length' and conrelid = 'public.club_settings'::regclass) then
    alter table public.club_settings add constraint club_settings_maintenance_message_length
      check (maintenance_message is null or char_length(maintenance_message) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'club_settings_maintenance_start_required' and conrelid = 'public.club_settings'::regclass) then
    alter table public.club_settings add constraint club_settings_maintenance_start_required
      check (not maintenance_banner_enabled or maintenance_starts_at is not null);
  end if;
end $$;

comment on column public.club_settings.maintenance_banner_enabled is
  'CMS switch for the site-wide maintenance banner. Shown on every page until maintenance_ends_at.';
comment on column public.club_settings.maintenance_starts_at is 'Maintenance start time shown in the banner.';
comment on column public.club_settings.maintenance_ends_at is 'Maintenance end time; the banner hides itself after it. Null means until further notice.';
comment on column public.club_settings.maintenance_message is 'Optional extra text for the maintenance banner (plain text, up to 300 characters).';

notify pgrst, 'reload schema';
