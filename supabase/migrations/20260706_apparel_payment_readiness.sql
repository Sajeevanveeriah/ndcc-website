-- Apparel payment readiness: additive, idempotent per-product payment fields.
-- The live path stays manual bank-transfer orders; these columns let the club
-- opt individual products into Stripe payment links / checkout later without
-- any code change. Safe to re-run.

alter table apparel_products add column if not exists payment_mode text not null default 'manual_enquiry';
alter table apparel_products add column if not exists payment_link_url text;
alter table apparel_products add column if not exists stripe_price_id text;
alter table apparel_products add column if not exists checkout_enabled boolean not null default false;
alter table apparel_products add column if not exists fulfilment_notes text;
alter table apparel_products add column if not exists order_email text;

-- Restrict payment_mode to the known set. Added defensively: only when the
-- constraint does not already exist, so re-running the migration is a no-op.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'apparel_products_payment_mode_check'
      and conrelid = 'public.apparel_products'::regclass
  ) then
    alter table apparel_products
      add constraint apparel_products_payment_mode_check
      check (payment_mode in ('manual_enquiry', 'stripe_payment_link', 'stripe_checkout'));
  end if;
end
$$;
