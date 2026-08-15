-- Replace stale operational season copy with active-season templates.
-- The application replaces {season} with the current club season name.
-- Rollback: restore these three CMS blocks from the recorded pre-cleanup
-- database backup or their original history-alignment migrations.

update public.content_blocks
set
  title = '{season} Update',
  body = 'Follow the latest club updates, match-day notices and announcements for {season} through our official channels.',
  cta_label = 'View {season} on PlayHQ',
  updated_at = now()
where block_key = 'home.season_status';

update public.content_blocks
set
  title = '{season} Fixtures',
  body = 'View published fixtures, results and ladders for {season} on PlayHQ.',
  cta_label = 'View {season} on PlayHQ',
  updated_at = now()
where block_key = 'fixtures.status';

update public.content_blocks
set
  title = 'Team Fixtures on PlayHQ',
  body = 'View current fixtures, results and ladders for each NDCC team on PlayHQ. Team links are managed here in the CMS.',
  cta_label = 'View on PlayHQ',
  updated_at = now()
where block_key = 'fixtures.team_links';

notify pgrst, 'reload schema';
