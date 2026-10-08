-- Team sheets can be published as uploaded images (one or more per sheet),
-- grouped by grade folder (Men's, Women's, Juniors) per round. Additive only:
-- existing rows keep an empty image list and their player lists.
-- Rollback: alter table public.team_sheets drop column if exists images;
alter table public.team_sheets
  add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.team_sheets drop constraint if exists team_sheets_images_shape;
alter table public.team_sheets add constraint team_sheets_images_shape
  check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 12);

notify pgrst, 'reload schema';
