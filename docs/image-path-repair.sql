-- Safe CMS image path repair. Run in Supabase SQL editor after backup.
do $$
begin
  if to_regclass('public.news') is not null then
    update news set image_url = replace(image_url, '/images/cms/', '/images/') where image_url like '/images/cms/%';
  end if;
  if to_regclass('public.events') is not null then
    update events set image_url = replace(image_url, '/images/cms/', '/images/') where image_url like '/images/cms/%';
  end if;
  if to_regclass('public.gallery_images') is not null then
    update gallery_images set image_url = replace(image_url, '/images/cms/', '/images/') where image_url like '/images/cms/%';
  end if;
  if to_regclass('public.teams') is not null then
    update teams set image_url = replace(image_url, '/images/cms/', '/images/') where image_url like '/images/cms/%';
  end if;
  if to_regclass('public.season_appointments') is not null then
    update season_appointments set image_url = replace(image_url, '/images/cms/', '/images/') where image_url like '/images/cms/%';
  end if;
  if to_regclass('public.sponsors') is not null then
    update sponsors set logo_url = replace(logo_url, '/images/cms/', '/images/') where logo_url like '/images/cms/%';
  end if;
  if to_regclass('public.content_blocks') is not null then
    update content_blocks set image_url = replace(image_url, '/images/cms/', '/images/') where image_url like '/images/cms/%';
  end if;
  if to_regclass('public.apparel_products') is not null then
    update apparel_products set image_url = replace(image_url, '/images/cms/', '/images/') where image_url like '/images/cms/%';
  end if;
  if to_regclass('public.kitchen_items') is not null then
    update kitchen_items set image_url = replace(image_url, '/images/cms/', '/images/') where image_url like '/images/cms/%';
  end if;
end $$;
