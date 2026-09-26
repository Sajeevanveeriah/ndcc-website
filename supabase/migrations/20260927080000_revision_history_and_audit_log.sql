-- WP6b: revision history for more CMS tables, Trash support and a general
-- admin audit log. Additive only.
--
-- 1. public.ndcc_archive_row_revision(): a new, exception-safe AFTER UPDATE OR
--    DELETE row trigger that copies the previous row into
--    public.editorial_revisions. It never modifies NEW, never blocks a write
--    (any failure is downgraded to a WARNING) and skips updates that change
--    nothing but updated_at. Its revision number is a per-record sequence
--    (max archived revision + 1) because these tables have no revision column.
--    The original versioned trigger on news, publications, events and
--    content_blocks (ndcc_archive_editorial_revision + revision column +
--    stale-save check) is left completely unchanged.
--    club_settings is skipped: its primary key is text ('default') and does
--    not fit editorial_revisions.record_id (uuid). Club settings changes are
--    recorded in admin_audit_log instead.
-- 2. A partial index so Trash can list recent archived deletions quickly.
-- 3. public.admin_audit_log, written best-effort by admin API routes.
--
-- Rollback (history already archived is kept; old app versions ignore it):
--   begin;
--   do $$ declare tbl text; begin
--     foreach tbl in array array['sponsors','player_sponsors','teams','season_appointments',
--       'gallery_albums','gallery_images','page_link_cards','facility_features',
--       'history_lineage_entries','history_premierships','history_competitions',
--       'committee_members','apparel_products','kitchen_menus','kitchen_items',
--       'social_membership_plans'] loop
--       if to_regclass('public.' || tbl) is not null then
--         execute format('drop trigger if exists ndcc_row_revision_history on public.%I', tbl);
--       end if;
--     end loop;
--   end $$;
--   drop function if exists public.ndcc_archive_row_revision();
--   drop index if exists public.editorial_revisions_deleted_idx;
--   drop table if exists public.admin_audit_log;
--   commit;

begin;
set local lock_timeout = '3s';

create or replace function public.ndcc_archive_row_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor text;
  old_row jsonb;
  next_revision integer;
begin
  begin
    old_row := to_jsonb(OLD);
    if TG_OP = 'UPDATE' and (old_row - 'updated_at') = (to_jsonb(NEW) - 'updated_at') then
      return null;
    end if;
    begin
      actor := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-ndcc-actor';
    exception when others then
      actor := null;
    end;
    select coalesce(max(r.revision), 0) + 1 into next_revision
      from public.editorial_revisions r
      where r.resource_table = TG_TABLE_NAME and r.record_id = (old_row ->> 'id')::uuid;
    insert into public.editorial_revisions(resource_table, record_id, revision, snapshot, action, changed_by)
    values (
      TG_TABLE_NAME,
      (old_row ->> 'id')::uuid,
      next_revision,
      old_row,
      TG_OP,
      case when actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then actor::uuid else null end
    );
  exception when others then
    -- History is a safety net; it must never block the CMS write itself.
    raise warning 'ndcc_archive_row_revision skipped for %.% (%): %', TG_TABLE_NAME, TG_OP, SQLSTATE, SQLERRM;
  end;
  return null;
end;
$$;
revoke all on function public.ndcc_archive_row_revision() from public, anon, authenticated;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'sponsors', 'player_sponsors', 'teams', 'season_appointments',
    'gallery_albums', 'gallery_images', 'page_link_cards', 'facility_features',
    'history_lineage_entries', 'history_premierships', 'history_competitions',
    'committee_members', 'apparel_products', 'kitchen_menus', 'kitchen_items',
    'social_membership_plans'
  ] loop
    -- Only tables that exist and have a uuid id column fit editorial_revisions.
    if to_regclass('public.' || tbl) is null then
      raise notice 'Skipping revision history for missing table %', tbl;
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'id' and data_type = 'uuid'
    ) then
      raise notice 'Skipping revision history for % (no uuid id column)', tbl;
      continue;
    end if;
    execute format('drop trigger if exists ndcc_row_revision_history on public.%I', tbl);
    execute format(
      'create trigger ndcc_row_revision_history after update or delete on public.%I for each row execute function public.ndcc_archive_row_revision()',
      tbl
    );
  end loop;
end $$;

create index if not exists editorial_revisions_deleted_idx
  on public.editorial_revisions (changed_at desc)
  where action = 'DELETE';

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text not null check (char_length(action) between 1 and 40),
  resource text not null check (char_length(resource) between 1 and 80),
  record_id text check (record_id is null or char_length(record_id) <= 200),
  summary text not null default '' check (char_length(summary) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from public, anon, authenticated;
grant select, insert on public.admin_audit_log to service_role;
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc, id desc);
create index if not exists admin_audit_log_resource_idx on public.admin_audit_log (resource, created_at desc);
create index if not exists admin_audit_log_actor_idx on public.admin_audit_log (actor_id, created_at desc);

notify pgrst, 'reload schema';
commit;
