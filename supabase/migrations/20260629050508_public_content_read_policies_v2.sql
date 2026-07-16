-- History-alignment copy. This migration was applied directly to the remote
-- database (version 20260629050508, recorded name
-- "20260629_public_content_read_policies_v2") without a matching file in this
-- directory. It re-created the public read policies under different policy
-- names during the June 29 recovery session (the duplicates were later
-- consolidated by 20260630_cleanup_duplicate_public_read_policies.sql). The
-- SQL below is recovered verbatim from
-- supabase_migrations.schema_migrations.statements. Do not edit and do not
-- re-apply manually: the remote history already records it as applied.

do $$
declare
  policy_exists boolean;
begin
  if to_regclass('public.content_blocks') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.content_blocks'::regclass and polname = 'public_read_active_content_blocks') into policy_exists;
    if not policy_exists then create policy public_read_active_content_blocks on public.content_blocks for select to anon, authenticated using (is_active = true); end if;
  end if;
  if to_regclass('public.facility_features') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.facility_features'::regclass and polname = 'public_read_active_facility_features') into policy_exists;
    if not policy_exists then create policy public_read_active_facility_features on public.facility_features for select to anon, authenticated using (is_active = true); end if;
  end if;
  if to_regclass('public.committee_members') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.committee_members'::regclass and polname = 'public_read_active_committee_members') into policy_exists;
    if not policy_exists then create policy public_read_active_committee_members on public.committee_members for select to anon, authenticated using (is_active = true); end if;
  end if;
  if to_regclass('public.gallery_images') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.gallery_images'::regclass and polname = 'public_read_published_gallery_images') into policy_exists;
    if not policy_exists then create policy public_read_published_gallery_images on public.gallery_images for select to anon, authenticated using (published = true); end if;
  end if;
  if to_regclass('public.history_competitions') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.history_competitions'::regclass and polname = 'public_read_history_competitions') into policy_exists;
    if not policy_exists then create policy public_read_history_competitions on public.history_competitions for select to anon, authenticated using (true); end if;
  end if;
  if to_regclass('public.history_lineage_entries') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.history_lineage_entries'::regclass and polname = 'public_read_active_history_lineage_entries') into policy_exists;
    if not policy_exists then create policy public_read_active_history_lineage_entries on public.history_lineage_entries for select to anon, authenticated using (is_active = true); end if;
  end if;
  if to_regclass('public.history_premierships') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.history_premierships'::regclass and polname = 'public_read_active_history_premierships') into policy_exists;
    if not policy_exists then create policy public_read_active_history_premierships on public.history_premierships for select to anon, authenticated using (is_active = true); end if;
  end if;
  if to_regclass('public.page_link_cards') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.page_link_cards'::regclass and polname = 'public_read_active_page_link_cards') into policy_exists;
    if not policy_exists then create policy public_read_active_page_link_cards on public.page_link_cards for select to anon, authenticated using (is_active = true); end if;
  end if;
  if to_regclass('public.season_appointments') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.season_appointments'::regclass and polname = 'public_read_active_season_appointments') into policy_exists;
    if not policy_exists then create policy public_read_active_season_appointments on public.season_appointments for select to anon, authenticated using (is_active = true); end if;
  end if;
  if to_regclass('public.volunteer_positions') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.volunteer_positions'::regclass and polname = 'public_read_active_volunteer_positions') into policy_exists;
    if not policy_exists then create policy public_read_active_volunteer_positions on public.volunteer_positions for select to anon, authenticated using (is_active = true); end if;
  end if;
  if to_regclass('public.social_membership_plans') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.social_membership_plans'::regclass and polname = 'public_read_active_social_membership_plans') into policy_exists;
    if not policy_exists then create policy public_read_active_social_membership_plans on public.social_membership_plans for select to anon, authenticated using (is_active = true); end if;
  end if;
  if to_regclass('public.social_membership_addons') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.social_membership_addons'::regclass and polname = 'public_read_active_social_membership_addons') into policy_exists;
    if not policy_exists then create policy public_read_active_social_membership_addons on public.social_membership_addons for select to anon, authenticated using (is_active = true); end if;
  end if;
  if to_regclass('public.apparel_products') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.apparel_products'::regclass and polname = 'public_read_active_apparel_products') into policy_exists;
    if not policy_exists then create policy public_read_active_apparel_products on public.apparel_products for select to anon, authenticated using (active = true); end if;
  end if;
  if to_regclass('public.kitchen_items') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.kitchen_items'::regclass and polname = 'public_read_available_kitchen_items') into policy_exists;
    if not policy_exists then create policy public_read_available_kitchen_items on public.kitchen_items for select to anon, authenticated using (is_available = true and is_hidden = false); end if;
  end if;
  if to_regclass('public.kitchen_menus') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.kitchen_menus'::regclass and polname = 'public_read_active_kitchen_menus') into policy_exists;
    if not policy_exists then create policy public_read_active_kitchen_menus on public.kitchen_menus for select to anon, authenticated using (is_active = true); end if;
  end if;
  if to_regclass('public.merch_order_windows') is not null then
    select exists (select 1 from pg_policy where polrelid = 'public.merch_order_windows'::regclass and polname = 'public_read_active_merch_order_windows') into policy_exists;
    if not policy_exists then create policy public_read_active_merch_order_windows on public.merch_order_windows for select to anon, authenticated using (active = true); end if;
  end if;
end $$;
