-- Server-only source for the NDCC committee calendar subscription proxy.
-- The private Google iCal address is data, not migration content, and must
-- never be committed to this public repository.

create table if not exists public.calendar_private_feeds (
  feed_key text primary key,
  source_url text not null,
  updated_at timestamptz not null default now(),
  constraint calendar_private_feeds_feed_key_format
    check (feed_key ~ '^[a-z0-9_-]+$'),
  constraint calendar_private_feeds_source_https
    check (source_url ~ '^https://')
);

alter table public.calendar_private_feeds enable row level security;
alter table public.calendar_private_feeds force row level security;

revoke all on table public.calendar_private_feeds from public, anon, authenticated;
grant select on table public.calendar_private_feeds to service_role;

comment on table public.calendar_private_feeds is
  'Server-only private upstream calendar feed configuration. Never expose through client code or public policies.';
comment on column public.calendar_private_feeds.source_url is
  'Private upstream ICS URL consumed only by trusted server-side code.';
