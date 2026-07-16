-- Pre-history baseline (2026/27 season readiness reconciliation).
--
-- Eight tables were created through the Supabase dashboard before any
-- committed migration existed, so no file in this directory created them:
-- contacts, event_registrations, events, news, profiles, sponsors,
-- volunteers and committee_users_test. Fresh-database replays (preview
-- branches, CI bootstraps) failed on the first ALTER/POLICY touching them.
--
-- This file records their production shape (captured from
-- information_schema on 2026-07-16) with CREATE TABLE IF NOT EXISTS, so:
--   * on production it is a pure no-op (all tables exist), and
--   * on a fresh database the rest of the lineage replays cleanly.
-- Column lists are the full current production shape; later
-- ADD COLUMN IF NOT EXISTS statements in the lineage no-op harmlessly.
--
-- Rollback: none needed (no-op on production); on a fresh replay database,
-- drop the created tables.

create table if not exists public.profiles (
  id uuid primary key,
  email text not null,
  role text default 'committee',
  display_name text,
  created_at timestamptz default now()
);

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  author text default 'NDCC',
  published boolean default false,
  published_at timestamptz,
  created_at timestamptz default now(),
  image_url text,
  sort_order integer not null default 0
);

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier text not null default 'standard',
  logo_url text,
  website text,
  placement_type text default 'listing',
  active boolean default true,
  created_at timestamptz default now(),
  description text not null default '',
  sort_order integer not null default 0,
  source_url text,
  logo_source_url text,
  verified_at timestamptz,
  logo_surface_mode text not null default 'auto',
  logo_padding text,
  logo_object_position text
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  enquiry_type text default 'general',
  responded boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  date timestamptz not null,
  location text default 'Grinter Reserve',
  capacity integer,
  ticket_price numeric default 0,
  stripe_link text,
  published boolean default false,
  created_at timestamptz default now(),
  image_url text
);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid,
  name text not null,
  email text not null,
  quantity integer default 1,
  payment_status text default 'pending',
  created_at timestamptz default now(),
  phone text default '',
  payment_reference text
);

create table if not exists public.volunteers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text default '',
  role text not null default 'General Help',
  availability text not null default '',
  processed boolean default false,
  created_at timestamptz default now()
);

-- Dashboard-era test artifact; kept for parity with production.
create table if not exists public.committee_users_test (
  id uuid primary key default gen_random_uuid(),
  email text
);
