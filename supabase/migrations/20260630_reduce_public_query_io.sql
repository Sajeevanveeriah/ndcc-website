-- Conservative public/admin query IO reduction.
-- This migration only adds supporting indexes where the referenced tables/columns exist.
-- It does not drop tables, delete data, rewrite rows, or remove unused indexes.

set lock_timeout = '5s';
set statement_timeout = '30s';

-- Session validation should use an existing unique/index on session_token_hash where available.
create index if not exists idx_committee_sessions_token_hash_lookup
  on public.committee_sessions (session_token_hash);

create index if not exists idx_page_link_cards_public_lookup
  on public.page_link_cards (page_slug, section_key, is_active, sort_order);

create index if not exists idx_committee_members_active_sort_lookup
  on public.committee_members (is_active, sort_order);

DO $$
BEGIN
  IF to_regclass('public.sponsors') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sponsors' AND column_name = 'active')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sponsors' AND column_name = 'sort_order')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sponsors' AND column_name = 'created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_sponsors_active_sort_created ON public.sponsors (active, sort_order, created_at);
  END IF;

  IF to_regclass('public.news') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'news' AND column_name = 'published')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'news' AND column_name = 'published_at')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'news' AND column_name = 'created_at') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'news' AND column_name = 'sort_order') THEN
      CREATE INDEX IF NOT EXISTS idx_news_published_sort_dates ON public.news (published, sort_order, published_at, created_at);
    ELSE
      CREATE INDEX IF NOT EXISTS idx_news_published_dates ON public.news (published, published_at, created_at);
    END IF;
  END IF;

  IF to_regclass('public.gallery_images') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gallery_images' AND column_name = 'sort_order') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gallery_images' AND column_name = 'published') THEN
      CREATE INDEX IF NOT EXISTS idx_gallery_images_published_sort ON public.gallery_images (published, sort_order);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gallery_images' AND column_name = 'is_active') THEN
      CREATE INDEX IF NOT EXISTS idx_gallery_images_active_sort ON public.gallery_images (is_active, sort_order);
    END IF;
  END IF;

  IF to_regclass('public.season_appointments') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'season_appointments' AND column_name = 'is_active')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'season_appointments' AND column_name = 'sort_order')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'season_appointments' AND column_name = 'announcement_date')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'season_appointments' AND column_name = 'name') THEN
    CREATE INDEX IF NOT EXISTS idx_season_appointments_active_sort_lookup ON public.season_appointments (is_active, sort_order, announcement_date, name);
  END IF;

  IF to_regclass('public.teams') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'is_active')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'sort_order')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'name') THEN
    CREATE INDEX IF NOT EXISTS idx_teams_active_sort_name_lookup ON public.teams (is_active, sort_order, name);
  END IF;

  IF to_regclass('public.event_registrations') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'event_id') THEN
    CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id ON public.event_registrations (event_id);
  END IF;

  IF to_regclass('public.member_applications') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'member_applications' AND column_name = 'membership_plan_id') THEN
      CREATE INDEX IF NOT EXISTS idx_member_applications_membership_plan_id ON public.member_applications (membership_plan_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'member_applications' AND column_name = 'order_id') THEN
      CREATE INDEX IF NOT EXISTS idx_member_applications_order_id_fk ON public.member_applications (order_id);
    END IF;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'confirmed_by') THEN
      CREATE INDEX IF NOT EXISTS idx_orders_confirmed_by ON public.orders (confirmed_by);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'merch_window_id') THEN
      CREATE INDEX IF NOT EXISTS idx_orders_merch_window_id ON public.orders (merch_window_id);
    END IF;
  END IF;

  IF to_regclass('public.kitchen_order_items') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kitchen_order_items' AND column_name = 'order_id') THEN
      CREATE INDEX IF NOT EXISTS idx_kitchen_order_items_order_id ON public.kitchen_order_items (order_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kitchen_order_items' AND column_name = 'item_id') THEN
      CREATE INDEX IF NOT EXISTS idx_kitchen_order_items_item_id ON public.kitchen_order_items (item_id);
    END IF;
  END IF;

  IF to_regclass('public.volunteer_expressions') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'volunteer_expressions' AND column_name = 'volunteer_position_id') THEN
    CREATE INDEX IF NOT EXISTS idx_volunteer_expressions_position_id ON public.volunteer_expressions (volunteer_position_id);
  END IF;

  IF to_regclass('public.fantasy_rosters') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fantasy_rosters' AND column_name = 'player_id') THEN
    CREATE INDEX IF NOT EXISTS idx_fantasy_rosters_player_id ON public.fantasy_rosters (player_id);
  END IF;

  IF to_regclass('public.fantasy_rosters') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fantasy_rosters' AND column_name = 'team_id') THEN
    CREATE INDEX IF NOT EXISTS idx_fantasy_rosters_team_id ON public.fantasy_rosters (team_id);
  END IF;
END $$;
