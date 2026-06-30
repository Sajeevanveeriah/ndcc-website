-- Non-destructive runtime IO reduction indexes for high-frequency public/admin reads.
set lock_timeout = '5s';
set statement_timeout = '30s';

create index if not exists idx_committee_users_lower_email on committee_users (lower(email));
create index if not exists idx_page_link_cards_public_lookup on page_link_cards (page_slug, section_key, is_active, sort_order);
create index if not exists idx_content_blocks_active_block_key on content_blocks (is_active, block_key);
create index if not exists idx_committee_members_active_sort on committee_members (is_active, sort_order);

do $$
begin
  if to_regclass('public.events') is not null then
    create index if not exists idx_events_published_date on events (published, date);
  end if;

  if to_regclass('public.teams') is not null then
    create index if not exists idx_teams_active_sort_name on teams (is_active, sort_order, name);
  end if;

  if to_regclass('public.season_appointments') is not null then
    create index if not exists idx_season_appointments_active_sort on season_appointments (is_active, sort_order, announcement_date, name);
  end if;
end $$;

-- Gallery schemas have varied between environments; only add indexes when columns exist.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gallery_images' and column_name = 'is_active')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gallery_images' and column_name = 'published') then
    create index if not exists idx_gallery_images_public_sort on gallery_images (is_active, published, sort_order);
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gallery_images' and column_name = 'is_active') then
    create index if not exists idx_gallery_images_active_sort on gallery_images (is_active, sort_order);
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gallery_images' and column_name = 'published') then
    create index if not exists idx_gallery_images_published_sort on gallery_images (published, sort_order);
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sponsors' and column_name = 'active')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sponsors' and column_name = 'created_at') then
    create index if not exists idx_sponsors_active_created on sponsors (active, created_at);
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sponsors' and column_name = 'active')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sponsors' and column_name = 'sort_order') then
    create index if not exists idx_sponsors_active_sort on sponsors (active, sort_order);
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'news' and column_name = 'published')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'news' and column_name = 'sort_order') then
    create index if not exists idx_news_published_sort_dates on news (published, sort_order, published_at, created_at);
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'news' and column_name = 'published') then
    create index if not exists idx_news_published_dates on news (published, published_at, created_at);
  end if;
end $$;
