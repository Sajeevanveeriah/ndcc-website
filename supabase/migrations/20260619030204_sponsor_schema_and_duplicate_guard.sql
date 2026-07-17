-- History-alignment copy. This migration was applied directly to the remote
-- database (version 20260619030204) without a matching file in this
-- directory. The SQL below is recovered verbatim from
-- supabase_migrations.schema_migrations.statements. Do not edit and do not
-- re-apply manually: the remote history already records it as applied.

alter table public.sponsors add column if not exists description text not null default '';
alter table public.sponsors add column if not exists sort_order integer not null default 0;
alter table public.sponsors add column if not exists source_url text;
alter table public.sponsors add column if not exists logo_source_url text;
alter table public.sponsors add column if not exists verified_at timestamptz;
create unique index if not exists sponsors_name_ci_unique on public.sponsors ((lower(btrim(name))));
