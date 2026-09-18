-- Immutable email payloads and a retry lease prevent lost or concurrent welcomes.
create table public.fantasy_registration_emails (
  entry_id uuid primary key references public.fantasy_entries(id) on delete cascade,
  recipient text not null,
  display_name text not null,
  team_name text not null,
  entry_fee_cents integer not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text
);
alter table public.fantasy_registration_emails enable row level security;
revoke all on public.fantasy_registration_emails from public, anon, authenticated;
grant all on public.fantasy_registration_emails to service_role;

create function public.queue_fantasy_registration_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.fantasy_registration_emails(entry_id,recipient,display_name,team_name,entry_fee_cents)
  select new.id,email,display_name,team_name,new.entry_fee_cents
  from public.fantasy_managers where id=new.manager_id
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.queue_fantasy_registration_email() from public, anon, authenticated;
create trigger queue_fantasy_registration_email after insert on public.fantasy_entries
for each row execute function public.queue_fantasy_registration_email();

insert into public.fantasy_registration_emails(entry_id,recipient,display_name,team_name,entry_fee_cents)
select e.id,m.email,m.display_name,m.team_name,e.entry_fee_cents
from public.fantasy_entries e join public.fantasy_managers m on m.id=e.manager_id
where e.status in ('payment_required','pending','paid') on conflict do nothing;

create function public.claim_fantasy_registration_email(p_entry_id uuid)
returns setof public.fantasy_registration_emails
language sql security definer set search_path = public as $$
  update public.fantasy_registration_emails
  set attempts=attempts+1, lease_until=now()+interval '5 minutes'
  where entry_id=p_entry_id and sent_at is null and next_attempt_at<=now()
    and (lease_until is null or lease_until<now())
  returning *;
$$;
revoke all on function public.claim_fantasy_registration_email(uuid) from public, anon, authenticated;
grant execute on function public.claim_fantasy_registration_email(uuid) to service_role;
