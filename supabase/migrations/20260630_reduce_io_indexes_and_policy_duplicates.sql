-- Reduce avoidable public read and foreign-key IO. Also remove known duplicate public-read RLS policies.
-- This migration is conservative: it only adds indexes and drops known duplicate public-read policies by name.

set lock_timeout = '5s';
set statement_timeout = '30s';

create index if not exists idx_committee_sessions_token_hash_lookup on public.committee_sessions (session_token_hash);
create index if not exists idx_page_link_cards_public_lookup on public.page_link_cards (page_slug, section_key, is_active, sort_order);
create index if not exists idx_committee_members_active_sort_lookup on public.committee_members (is_active, sort_order);

DO $$
BEGIN
  IF to_regclass('public.sponsors') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sponsors' AND column_name='active') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sponsors' AND column_name='sort_order')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sponsors' AND column_name='created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_sponsors_active_sort_created ON public.sponsors (active, sort_order, created_at);
    END IF;
  END IF;

  IF to_regclass('public.news') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='news' AND column_name='published') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='news' AND column_name='sort_order') THEN
      CREATE INDEX IF NOT EXISTS idx_news_published_sort_dates ON public.news (published, sort_order, published_at, created_at);
    ELSE
      CREATE INDEX IF NOT EXISTS idx_news_published_dates ON public.news (published, published_at, created_at);
    END IF;
  END IF;

  IF to_regclass('public.gallery_images') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gallery_images' AND column_name='published') THEN
    CREATE INDEX IF NOT EXISTS idx_gallery_images_published_sort ON public.gallery_images (published, sort_order);
  END IF;

  IF to_regclass('public.season_appointments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_season_appointments_active_sort_lookup ON public.season_appointments (is_active, sort_order, announcement_date, name);
  END IF;

  IF to_regclass('public.teams') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_teams_active_sort_name_lookup ON public.teams (is_active, sort_order, name);
  END IF;

  IF to_regclass('public.event_registrations') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id ON public.event_registrations (event_id); END IF;
  IF to_regclass('public.member_applications') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_member_applications_membership_plan_id ON public.member_applications (membership_plan_id);
    CREATE INDEX IF NOT EXISTS idx_member_applications_order_id_fk ON public.member_applications (order_id);
  END IF;
  IF to_regclass('public.orders') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_orders_confirmed_by ON public.orders (confirmed_by);
    CREATE INDEX IF NOT EXISTS idx_orders_merch_window_id ON public.orders (merch_window_id);
  END IF;
  IF to_regclass('public.kitchen_order_items') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_kitchen_order_items_order_id ON public.kitchen_order_items (order_id);
    CREATE INDEX IF NOT EXISTS idx_kitchen_order_items_item_id ON public.kitchen_order_items (item_id);
  END IF;
  IF to_regclass('public.volunteer_expressions') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_volunteer_expressions_position_id ON public.volunteer_expressions (volunteer_position_id); END IF;
END $$;

-- Known duplicate public-read policy cleanup. Keep the newer public_read_active_* policy names.
DROP POLICY IF EXISTS committee_members_public_read_active ON public.committee_members;
DROP POLICY IF EXISTS facility_features_public_read_active ON public.facility_features;
DROP POLICY IF EXISTS history_lineage_entries_public_read_active ON public.history_lineage_entries;
DROP POLICY IF EXISTS history_premierships_public_read_active ON public.history_premierships;
DROP POLICY IF EXISTS teams_public_read_active ON public.teams;
