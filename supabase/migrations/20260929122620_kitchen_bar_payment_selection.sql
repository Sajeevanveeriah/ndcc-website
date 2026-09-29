-- Purchaser intent only, like bank_transfer_selected_at: the customer will pay
-- cash at the bar on collection. It is never proof of payment and never counts
-- towards amount_paid; staff still record the cash when it is received.
-- Idempotent so a re-run through the hosted Git integration is harmless.
alter table public.orders add column if not exists bar_payment_selected_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_bar_payment_kitchen_only') then
    alter table public.orders add constraint orders_bar_payment_kitchen_only
      check (bar_payment_selected_at is null or order_category = 'kitchen');
  end if;
end $$;
comment on column public.orders.bar_payment_selected_at is 'Kitchen purchaser chose to pay cash at the bar; not proof of receipt and never included in amount_paid.';
notify pgrst, 'reload schema';
