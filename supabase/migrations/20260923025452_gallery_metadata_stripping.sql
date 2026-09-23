-- Track which gallery originals have had camera metadata (GPS location,
-- device details) stripped. New uploads are cleaned before finalisation; a
-- daily job cleans older originals and stamps this column.
alter table public.gallery_images
  add column if not exists metadata_stripped_at timestamptz;

create index if not exists gallery_images_metadata_pending_idx
  on public.gallery_images (uploaded_at)
  where metadata_stripped_at is null and storage_path is not null;
