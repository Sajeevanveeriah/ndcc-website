-- WP6c: CMS promotions, media library, scheduling columns, Pot Club product
-- selection and the member newsletter send log.
--
-- Everything here is additive. Application code falls back to its existing
-- hardcoded behaviour when any of these objects are missing, so the code can
-- ship before or after this migration.
--
-- Rollback (run in one transaction; removes only objects created here):
--   begin;
--   drop table if exists public.newsletter_deliveries;
--   drop table if exists public.newsletter_sends;
--   drop table if exists public.media_assets;
--   drop table if exists public.site_promotions;
--   alter table public.events drop column if exists published_at;
--   alter table public.sponsors drop column if exists published_at;
--   alter table public.club_settings drop column if exists pot_club_product_code;
--   notify pgrst, 'reload schema';
--   commit;
begin;
set local lock_timeout = '3s';

-- 1. Time-limited promotions (home banners and fundraisers).
create table public.site_promotions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) <= 80),
  kind text not null check (kind in ('home_banner', 'fundraiser')),
  title text not null default '' check (length(title) <= 200),
  body text not null default '' check (length(body) <= 4000),
  link_url text,
  link_label text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  placement text not null default 'home' check (length(placement) <= 80),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or starts_at < ends_at)
);
alter table public.site_promotions enable row level security;
revoke all on public.site_promotions from public, anon, authenticated;
grant select, insert, update, delete on public.site_promotions to service_role;

-- Seed with the promotions currently hardcoded in lib/home-promotions.ts,
-- lib/cookie-dough.ts and lib/public-links.ts so behaviour is identical.
insert into public.site_promotions
  (slug, kind, title, body, link_url, link_label, image_url, starts_at, ends_at, placement, details, active, sort_order)
values
  ('junior-vouchers', 'home_banner', 'Get Active Kids vouchers',
   'Eligible Victorian children aged 0 to 18 may receive up to $200 each towards sport membership and registration fees.',
   'https://www.getactive.vic.gov.au/vouchers/', 'Check eligibility and apply', null,
   '2026-09-15T00:00:00+10:00', '2026-10-13T10:00:00+11:00', 'home',
   jsonb_build_object(
     'anchorId', 'junior-vouchers',
     'heroLinkLabel', 'Junior vouchers - up to $200',
     'roundLabel', 'Round 11',
     'startLabel', '15 September',
     'endLabel', '10 am on 13 October 2026',
     'applicationDetailsUrl', 'https://www.getactive.vic.gov.au/vouchers/apply-for-vouchers/'
   ), true, 10),
  ('cookie-dough', 'fundraiser', 'Billy G''s Cookie Dough Fundraiser',
   'Register as an NDCC fundraiser, share your page, or purchase cookie dough to support the club.',
   'https://cookiedough.com.au/school/69fbe85f1fc836e997e6f70d/view?data=%7B%22campaignId%22%3A%226a990b65d4b1ae7e61e32a1a%22%2C%22return%22%3A%22%2Fcampaign%2F6a990b65d4b1ae7e61e32a1a%2Fview%22%7D',
   null, '/images/fundraisers/billy-gs-cookie-selection.png',
   null, '2026-09-30T21:00:00+10:00', 'fundraising',
   jsonb_build_object('deadlineLabel', 'Ends 30 September 2026 at 9 pm (Melbourne time).'), true, 20)
on conflict (slug) do nothing;

-- 2. Media library. One row per published object in the public CMS bucket.
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'cms-media',
  path text not null check (length(path) between 1 and 512),
  public_url text,
  alt_text text not null default '' check (length(alt_text) <= 300),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  bytes bigint check (bytes is null or bytes >= 0),
  content_type text,
  uploaded_by uuid references public.committee_users(id) on delete set null,
  usage_hint text check (usage_hint is null or length(usage_hint) <= 80),
  created_at timestamptz not null default now(),
  unique (bucket, path)
);
create index media_assets_created_at_idx on public.media_assets (created_at desc);
create index media_assets_uploaded_by_idx on public.media_assets (uploaded_by);
alter table public.media_assets enable row level security;
revoke all on public.media_assets from public, anon, authenticated;
grant select, insert, update, delete on public.media_assets to service_role;

-- Backfill existing published files. public_url is left null and derived by
-- the application from the path (the project URL is not known here).
do $$
begin
  if to_regclass('storage.objects') is not null then
    insert into public.media_assets (bucket, path, bytes, content_type, created_at)
    select o.bucket_id, o.name,
      case when (o.metadata ->> 'size') ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint end,
      o.metadata ->> 'mimetype',
      coalesce(o.created_at, now())
    from storage.objects o
    where o.bucket_id = 'cms-media' and o.name is not null and length(o.name) <= 512
    on conflict (bucket, path) do nothing;
  end if;
end $$;

-- 3. Scheduled publishing. Null means "visible as soon as published/active".
alter table public.events add column if not exists published_at timestamptz;
alter table public.sponsors add column if not exists published_at timestamptz;

-- 4. Pot Club product selection. Null means the original product code.
alter table public.club_settings add column if not exists pot_club_product_code text
  check (pot_club_product_code is null or length(pot_club_product_code) between 1 and 80);

-- 5. Member newsletter send log.
create table public.newsletter_sends (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (length(subject) between 1 and 200),
  body text not null check (length(body) between 1 and 20000),
  sent_by uuid references public.committee_users(id) on delete set null,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  status text not null default 'sending' check (status in ('sending', 'sent', 'partial', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index newsletter_sends_created_at_idx on public.newsletter_sends (created_at desc);
create index newsletter_sends_sent_by_idx on public.newsletter_sends (sent_by);
alter table public.newsletter_sends enable row level security;
revoke all on public.newsletter_sends from public, anon, authenticated;
grant select, insert, update, delete on public.newsletter_sends to service_role;

create table public.newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references public.newsletter_sends(id) on delete cascade,
  member_id uuid references public.club_members(id) on delete set null,
  email text not null check (length(email) between 3 and 254),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  error text check (error is null or length(error) <= 500),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (send_id, email)
);
create index newsletter_deliveries_send_status_idx on public.newsletter_deliveries (send_id, status);
create index newsletter_deliveries_member_idx on public.newsletter_deliveries (member_id);
alter table public.newsletter_deliveries enable row level security;
revoke all on public.newsletter_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.newsletter_deliveries to service_role;

notify pgrst, 'reload schema';
commit;
