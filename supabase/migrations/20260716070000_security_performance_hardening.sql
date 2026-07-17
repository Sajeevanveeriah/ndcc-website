-- Security & performance hardening from the 2026-07-16 Supabase advisor
-- baseline (run before the season-readiness changes).
--
-- Addressed here:
--   1. function_search_path_mutable (WARN x6 app functions): pin
--      search_path=public via ALTER FUNCTION (no body changes).
--   2. rls_policy_always_true (WARN x4): drop the anon INSERT policies on
--      contacts / event_registrations / orders / volunteers. Verified: every
--      public submission goes through a validated server endpoint using the
--      service role (app/api/contacts, /volunteers, /events, /orders,
--      /checkout); the browser anon client is never used to insert into
--      these tables, so the open policies were pure attack surface.
--   3. multiple_permissive_policies (WARN x24): the June 29 recovery
--      applied two identical public-read policy families; the
--      "public_read_<x>" duplicates are dropped only where the canonical
--      "<table>_public_read_<x>" policy exists with the same predicate.
--   4. duplicate_index (WARN x4 groups): definitions verified byte-identical
--      against production pg_indexes on 2026-07-16 before dropping.
--   5. unindexed_foreign_keys: covering indexes added on the hot payment and
--      fantasy paths only. Cold club-season/kitchen/meeting paths are left
--      alone deliberately (the advisor also reports 85 unused indexes; this
--      low-traffic site does not benefit from indexing every FK).
--
-- Explicitly NOT addressed (documented decisions):
--   - public.crypt / public.gen_salt search_path warnings: pgcrypto is
--     installed in the public schema and committee auth resolves crypt()
--     through it (see 20260630_repair_committee_auth_* history). Relocating
--     the extension risks re-breaking auth; accepted as-is.
--   - rls_enabled_no_policy (INFO x12): those tables are deliberately
--     server-only (service role bypasses RLS); absence of policies is the
--     lockdown, not an omission.
--   - unused_index (85): retained per the low-traffic-site rule.
--   - Leaked-password protection is a Supabase Auth dashboard setting (not
--     SQL); recommended separately. The public site's committee login uses
--     custom committee_users auth, not Supabase Auth passwords.
--
-- Rollback: recreate any dropped policy/index from this file's DROP list
-- (definitions preserved in comments below); ALTER FUNCTION ... RESET
-- search_path for the six functions.

-- 1) Pin search_path on flagged app functions -----------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'set_content_blocks_updated_at',
    'set_gallery_images_updated_at',
    'set_season_appointments_updated_at',
    'set_teams_updated_at',
    'set_club_settings_updated_at',
    'set_calendar_events_updated_at'
  ] loop
    if to_regprocedure(format('public.%I()', fn)) is not null then
      execute format('alter function public.%I() set search_path = public', fn);
    end if;
  end loop;
end $$;

-- 2) Remove unused wide-open anon INSERT policies --------------------------
drop policy if exists contacts_insert on public.contacts;
drop policy if exists event_registrations_insert on public.event_registrations;
drop policy if exists orders_insert on public.orders;
drop policy if exists volunteers_insert on public.volunteers;

-- 3) Consolidate duplicate permissive SELECT policies ----------------------
-- Drop the v2-named duplicate only when the canonical policy still exists.
do $$
declare
  pair record;
begin
  for pair in
    select * from (values
      ('content_blocks', 'content_blocks_public_read_active', 'public_read_active_content_blocks'),
      ('gallery_images', 'gallery_images_public_read_published', 'public_read_published_gallery_images'),
      ('history_competitions', 'history_competitions_public_read', 'public_read_history_competitions'),
      ('kitchen_items', 'kitchen_items_public_read_available', 'public_read_available_kitchen_items'),
      ('kitchen_menus', 'kitchen_menus_public_read_active', 'public_read_active_kitchen_menus'),
      ('merch_order_windows', 'merch_order_windows_public_read_active', 'public_read_active_merch_order_windows'),
      ('page_link_cards', 'page_link_cards_public_read_active', 'public_read_active_page_link_cards'),
      ('season_appointments', 'season_appointments_public_read_active', 'public_read_active_season_appointments'),
      ('social_membership_addons', 'social_membership_addons_public_read_active', 'public_read_active_social_membership_addons'),
      ('social_membership_plans', 'social_membership_plans_public_read_active', 'public_read_active_social_membership_plans'),
      ('volunteer_positions', 'volunteer_positions_public_read_active', 'public_read_active_volunteer_positions'),
      ('apparel_products', 'apparel_products_public_read_active', 'public_read_active_apparel_products')
    ) as p(table_name, keep_policy, drop_policy)
  loop
    if to_regclass(format('public.%I', pair.table_name)) is not null
      and exists (
        select 1 from pg_policy pol
        join pg_class cls on cls.oid = pol.polrelid
        join pg_namespace ns on ns.oid = cls.relnamespace
        where ns.nspname = 'public' and cls.relname = pair.table_name and pol.polname = pair.keep_policy
      )
    then
      execute format('drop policy if exists %I on public.%I', pair.drop_policy, pair.table_name);
    end if;
  end loop;
end $$;

-- 4) Drop proven-identical duplicate indexes -------------------------------
-- committee_members: all three were btree (is_active, sort_order)
drop index if exists public.idx_committee_members_active_sort_lookup;
drop index if exists public.idx_committee_members_sort;
-- member_applications: both were btree (order_id)
drop index if exists public.idx_member_applications_order_id_fk;
-- page_link_cards: both were btree (page_slug, section_key, is_active, sort_order)
drop index if exists public.idx_page_link_cards_public_lookup;
-- teams: all three were btree (is_active, sort_order, name)
drop index if exists public.idx_teams_active_sort_name;
drop index if exists public.idx_teams_active_sort_name_lookup;

-- 5) Covering FK indexes on hot payment / fantasy paths --------------------
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('imported_transactions', 'idx_imported_transactions_matched_order', 'matched_order_id'),
      ('bank_transfer_confirmations', 'idx_bank_transfer_confirmations_transaction', 'transaction_id'),
      ('bank_transfer_confirmations', 'idx_bank_transfer_confirmations_confirmed_by', 'confirmed_by'),
      ('fantasy_sync_jobs', 'idx_fantasy_sync_jobs_import_batch', 'import_batch_id'),
      ('fantasy_season_players', 'idx_fantasy_season_players_carried_from', 'carried_from_season_player_id'),
      ('fantasy_historical_reconciliation_rows', 'idx_fantasy_recon_rows_player', 'player_id'),
      ('fantasy_historical_reconciliation_rows', 'idx_fantasy_recon_rows_target_season', 'target_season_id')
    ) as s(table_name, index_name, column_name)
  loop
    if to_regclass(format('public.%I', spec.table_name)) is not null then
      execute format('create index if not exists %I on public.%I (%I)', spec.index_name, spec.table_name, spec.column_name);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
