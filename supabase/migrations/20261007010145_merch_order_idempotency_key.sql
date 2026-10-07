-- Merchandise orders: one order per purchaser submission attempt.
-- The public merchandise form sends a client-generated UUID with each order
-- attempt and reuses it for retries of the same submission. The unique index
-- makes the database the final arbiter, so two simultaneous requests with the
-- same key can never create two orders. The fingerprint (SHA-256 of the
-- submitted order details) lets a repeat with different details be refused
-- instead of silently answered with someone else's order.
--
-- Additive only: both columns are nullable and every existing order and every
-- request without a key keeps its current behaviour. meal_draft_token is not
-- reused: it is the kitchen draft key, readable through the kitchen resume
-- action, and is updated in place by save_meal_order.
--
-- Rollback (after the application release that writes these columns is
-- reverted; the route tolerates their absence):
--   drop index if exists public.orders_order_idempotency_key_unique;
--   alter table public.orders drop column if exists order_idempotency_fingerprint;
--   alter table public.orders drop column if exists order_idempotency_key;
-- Applied as one transaction by the migration runner; bound the brief
-- orders write lock taken by the index build.
set local lock_timeout = '3s';

alter table public.orders add column if not exists order_idempotency_key uuid;
alter table public.orders add column if not exists order_idempotency_fingerprint text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_order_idempotency_fingerprint_check'
                 and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_order_idempotency_fingerprint_check
      check (order_idempotency_fingerprint is null or order_idempotency_fingerprint ~ '^[0-9a-f]{64}$');
  end if;
end $$;

create unique index if not exists orders_order_idempotency_key_unique
  on public.orders (order_idempotency_key)
  where order_idempotency_key is not null;

comment on column public.orders.order_idempotency_key is
  'Client-generated key for one public merchandise order attempt; retries with the same key return the original order.';
comment on column public.orders.order_idempotency_fingerprint is
  'SHA-256 of the submitted merchandise order details for order_idempotency_key; a different payload with the same key is refused.';

