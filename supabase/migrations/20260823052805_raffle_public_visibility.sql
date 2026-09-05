-- CMS-controlled raffle visibility with a safe hidden default.
alter table public.raffle_campaigns
  add column if not exists public_visibility_mode text not null default 'hidden',
  add column if not exists public_opens_at timestamptz;

alter table public.raffle_campaigns
  drop constraint if exists raffle_campaigns_public_visibility_mode_check;

alter table public.raffle_campaigns
  add constraint raffle_campaigns_public_visibility_mode_check
  check (public_visibility_mode in ('hidden', 'scheduled', 'visible'));

update public.raffle_campaigns
set public_visibility_mode = 'scheduled',
    public_opens_at = '2026-09-09 00:00:00 Australia/Melbourne',
    updated_at = now()
where active = true;

