-- Apparel product option/variant model (2026/27 season readiness).
--
-- Price-changing selections (long-sleeve, zipped, fleece, colour) were
-- previously only describable in free text; server-side pricing could not
-- account for them. This table gives every option a machine value, a price
-- delta, an active flag and a display order so the server can recompute
-- unit prices from the database alone.
--
-- Selection semantics: options are grouped per product by option_group.
-- Each group is a single-choice selector; the is_default row is the
-- pre-selected zero-surcharge baseline. Independent groups (e.g. Hoody
-- "Style" and "Fabric") may be combined on one item.
--
-- Rollback: drop table public.apparel_product_options;
--           alter table public.apparel_products drop column image_alt;

alter table public.apparel_products
  add column if not exists image_alt text not null default '';

create table if not exists public.apparel_product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.apparel_products(id) on delete cascade,
  option_group text not null,
  option_value text not null,
  option_label text not null,
  price_delta numeric(10,2) not null default 0,
  is_default boolean not null default false,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, option_group, option_value)
);

create index if not exists apparel_product_options_product_idx
  on public.apparel_product_options (product_id);

alter table public.apparel_product_options enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.apparel_product_options'::regclass
      and polname = 'apparel_product_options_public_read_active'
  ) then
    create policy apparel_product_options_public_read_active
      on public.apparel_product_options
      for select to anon, authenticated
      using (active = true);
  end if;
end $$;

create or replace function public.set_apparel_product_options_updated_at()
returns trigger
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists apparel_product_options_updated_at on public.apparel_product_options;
create trigger apparel_product_options_updated_at
  before update on public.apparel_product_options
  for each row execute function public.set_apparel_product_options_updated_at();

notify pgrst, 'reload schema';
