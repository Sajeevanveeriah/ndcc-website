-- History-alignment copy. This migration was applied directly to the remote
-- database (version 20260629045440) without a matching file in this
-- directory. The SQL below is recovered verbatim from
-- supabase_migrations.schema_migrations.statements. Do not edit and do not
-- re-apply manually: the remote history already records it as applied.

-- Public read policies for CMS/public-content tables only.
-- Private/admin/session/order/payment tables intentionally remain closed.

DO $$
DECLARE
  policy_def RECORD;
BEGIN
  FOR policy_def IN
    SELECT * FROM (VALUES
      ('content_blocks', 'content_blocks_public_read_active', 'is_active = true'),
      ('facility_features', 'facility_features_public_read_active', 'is_active = true'),
      ('committee_members', 'committee_members_public_read_active', 'is_active = true'),
      ('gallery_images', 'gallery_images_public_read_published', 'published = true'),
      ('history_competitions', 'history_competitions_public_read', 'true'),
      ('history_lineage_entries', 'history_lineage_entries_public_read_active', 'is_active = true'),
      ('history_premierships', 'history_premierships_public_read_active', 'is_active = true'),
      ('page_link_cards', 'page_link_cards_public_read_active', 'is_active = true'),
      ('season_appointments', 'season_appointments_public_read_active', 'is_active = true'),
      ('volunteer_positions', 'volunteer_positions_public_read_active', 'is_active = true'),
      ('social_membership_plans', 'social_membership_plans_public_read_active', 'is_active = true'),
      ('social_membership_addons', 'social_membership_addons_public_read_active', 'is_active = true'),
      ('apparel_products', 'apparel_products_public_read_active', 'active = true'),
      ('kitchen_items', 'kitchen_items_public_read_available', 'is_available = true and is_hidden = false'),
      ('kitchen_menus', 'kitchen_menus_public_read_active', 'is_active = true'),
      ('merch_order_windows', 'merch_order_windows_public_read_active', 'active = true')
    ) AS p(table_name, policy_name, predicate)
  LOOP
    IF to_regclass(format('public.%I', policy_def.table_name)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policy pol
        JOIN pg_class cls ON cls.oid = pol.polrelid
        JOIN pg_namespace ns ON ns.oid = cls.relnamespace
        WHERE ns.nspname = 'public'
          AND cls.relname = policy_def.table_name
          AND pol.polname = policy_def.policy_name
      )
    THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (%s)',
        policy_def.policy_name,
        policy_def.table_name,
        policy_def.predicate
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
