-- History-alignment copy. This migration was applied directly to the remote
-- database (version 20260619024827) without a matching file in this
-- directory. The SQL below is recovered verbatim from
-- supabase_migrations.schema_migrations.statements. Do not edit and do not
-- re-apply manually: the remote history already records it as applied.

-- Remove self-referential profile policies that caused infinite recursion.
-- Each authenticated user may access only their own profile row.

alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select
on public.profiles
for select
using (id = (select auth.uid()));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert
on public.profiles
for insert
with check (id = (select auth.uid()));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update
on public.profiles
for update
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete
on public.profiles
for delete
using (id = (select auth.uid()));

notify pgrst, 'reload schema';
