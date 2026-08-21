-- Auditable, expiring, single-use capability for bounded release operations.
-- The table declaration makes clean migration replay deterministic while
-- preserving any token audit rows already present in deployed environments.
create table if not exists public.fantasy_release_tokens (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.fantasy_release_tokens enable row level security;
revoke all on table public.fantasy_release_tokens from anon, authenticated;

create or replace function public.consume_fantasy_release_token(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  consumed_id uuid;
begin
  update public.fantasy_release_tokens
  set used_at = now()
  where token_hash = p_token_hash
    and used_at is null
    and revoked_at is null
    and expires_at > now()
  returning id into consumed_id;

  return consumed_id;
end;
$$;

revoke all on function public.consume_fantasy_release_token(text) from public, anon, authenticated;
grant execute on function public.consume_fantasy_release_token(text) to service_role;
