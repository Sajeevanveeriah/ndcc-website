-- Claim apparel orders into a single export batch so separate users and
-- successive exports cannot include the same order twice.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_category text not null default 'general',
  created_at timestamptz default now()
);

alter table public.orders
  add column if not exists apparel_export_batch_id uuid,
  add column if not exists apparel_exported_at timestamptz;

create index if not exists orders_unexported_apparel_created_idx
  on public.orders (created_at)
  where order_category = 'merch' and apparel_export_batch_id is null;

comment on column public.orders.apparel_export_batch_id is
  'Unique workbook export that first claimed this apparel order.';
comment on column public.orders.apparel_exported_at is
  'Timestamp when the apparel order was first claimed for workbook export.';

notify pgrst, 'reload schema';
