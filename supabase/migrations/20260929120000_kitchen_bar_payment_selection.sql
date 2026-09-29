begin;
-- Purchaser intent only, like bank_transfer_selected_at: the customer will pay
-- cash at the bar on collection. It is never proof of payment and never counts
-- towards amount_paid; staff still mark the order paid when cash is received.
alter table public.orders add column bar_payment_selected_at timestamptz;
alter table public.orders add constraint orders_bar_payment_kitchen_only
  check (bar_payment_selected_at is null or order_category = 'kitchen');
comment on column public.orders.bar_payment_selected_at is 'Kitchen purchaser chose to pay cash at the bar; not proof of receipt and never included in amount_paid.';
notify pgrst, 'reload schema';
commit;
