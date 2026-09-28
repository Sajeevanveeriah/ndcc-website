-- Spin the Wheel show/hide switch (requested by Saj, 28 September 2026).
-- One club-wide flag the CMS toggles from Raffle > Spin the Wheel. Off hides
-- the feature from the public website (page, navigation, footer, sitemap,
-- member dashboard and every public /api/spin-wheel route) without touching
-- any wheel, segment, prize, pass, order or result, so switching it back on
-- restores the feature exactly as configured. Defaults to on, which keeps the
-- current behaviour (each wheel's own visibility still applies).
alter table public.club_settings
  add column if not exists spin_wheel_enabled boolean not null default true;

comment on column public.club_settings.spin_wheel_enabled is
  'CMS show/hide switch for Spin the Wheel on the public website. Hiding preserves all wheel configuration and data.';

notify pgrst, 'reload schema';
