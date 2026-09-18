-- Recipient configuration is private runtime data, never seeded into public source.
create table public.dino_feedback_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  recipients text[] not null check (cardinality(recipients) between 1 and 5)
);
alter table public.dino_feedback_config enable row level security;
revoke all on public.dino_feedback_config from public, anon, authenticated;
grant select, insert, update on public.dino_feedback_config to service_role;

create table public.dino_feedback_jobs (
  id uuid primary key,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  request jsonb not null,
  recipients text[] not null,
  delivery jsonb,
  created_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  attempts integer not null default 0,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  needs_review_at timestamptz
);
alter table public.dino_feedback_jobs enable row level security;
revoke all on public.dino_feedback_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.dino_feedback_jobs to service_role;
create index dino_feedback_contact on public.dino_feedback_jobs(contact_id);
create index dino_feedback_pending on public.dino_feedback_jobs(next_attempt_at)
  where sent_at is null and needs_review_at is null;

create function public.submit_dino_feedback(p_id uuid, p_request jsonb)
returns uuid language plpgsql set search_path='' as $$
declare prior jsonb; targets text[]; contact uuid;
begin
  if p_id is null or jsonb_typeof(p_request) is distinct from 'object'
    or jsonb_typeof(p_request->'name') is distinct from 'string'
    or jsonb_typeof(p_request->'email') is distinct from 'string'
    or jsonb_typeof(p_request->'message') is distinct from 'string'
    or length(trim(p_request->>'name')) not between 1 and 100
    or length(p_request->>'email') not between 3 and 254
    or (p_request->>'email') !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
    or length(trim(p_request->>'message')) not between 10 and 5000
    or coalesce(p_request->>'kind','') not in ('issue','suggestion','feedback')
    then raise exception 'Invalid feedback.' using errcode='check_violation'; end if;
  perform pg_advisory_xact_lock(hashtextextended('dino-feedback:'||p_id::text,0));
  select request into prior from public.dino_feedback_jobs where id=p_id;
  if found then
    if prior is distinct from p_request then raise exception 'Submission already exists.' using errcode='unique_violation'; end if;
    return p_id;
  end if;
  select recipients into targets from public.dino_feedback_config where singleton and enabled;
  if coalesce(cardinality(targets),0)=0 then raise exception 'Feedback is unavailable.'; end if;
  if exists(select 1 from unnest(targets) t where t is null or t !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then raise exception 'Feedback is unavailable.'; end if;
  insert into public.contacts(name,email,enquiry_type,message,responded)
    values(p_request->>'name',p_request->>'email','dino-feedback',
      'Type: '||(p_request->>'kind')||E'\nReference: '||p_id::text||E'\n\n'||(p_request->>'message'),false)
    returning id into contact;
  insert into public.dino_feedback_jobs(id,contact_id,request,recipients)
    values(p_id,contact,p_request,targets);
  return p_id;
end; $$;
revoke all on function public.submit_dino_feedback(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.submit_dino_feedback(uuid,jsonb) to service_role;

create function public.claim_dino_feedback(p_id uuid default null)
returns setof public.dino_feedback_jobs language plpgsql set search_path='' as $$
begin
  -- Resend retains idempotency keys for 24 hours. Stop ambiguous automatic
  -- retries before that window expires; the original remains in CMS Enquiries.
  update public.dino_feedback_jobs set needs_review_at=now(), lease_until=null,
    last_error='Delivery needs review. Read the saved message in CMS Enquiries.'
    where sent_at is null and needs_review_at is null
      and first_attempt_at <= now()-interval '23 hours'
      and (lease_until is null or lease_until < now());
  return query
    update public.dino_feedback_jobs j set lease_until=now()+interval '2 minutes',
      attempts=j.attempts+1,first_attempt_at=coalesce(j.first_attempt_at,now())
    where j.id=(select q.id from public.dino_feedback_jobs q
      where q.sent_at is null and q.needs_review_at is null and q.next_attempt_at<=now()
        and (p_id is null or q.id=p_id) and (q.lease_until is null or q.lease_until<now())
      order by q.created_at for update skip locked limit 1)
    returning j.*;
end; $$;
revoke all on function public.claim_dino_feedback(uuid) from public, anon, authenticated;
grant execute on function public.claim_dino_feedback(uuid) to service_role;
