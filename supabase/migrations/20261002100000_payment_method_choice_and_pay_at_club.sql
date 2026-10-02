-- One recorded payment method per order: Stripe checkout, bank transfer or
-- pay at the club (cash or card over the bar).
--
-- 1. orders.payment_method_choice is the purchaser's (or an administrator's)
--    stated method. Like bank_transfer_selected_at and bar_payment_selected_at
--    it is intent only: it is never proof of payment and never changes
--    amount_paid. Settled money stays in the order_payments ledger.
-- 2. Pay at the club is no longer kitchen only. bar_payment_selected_at now
--    records "will pay at the club" for any order category; the kitchen keeps
--    its special-request rules in application code.
-- 3. A trigger keeps payment_method_choice in step with the two existing
--    intent columns, so every current route records the choice without
--    further changes. Card checkout routes set 'stripe' explicitly.
-- 4. Past orders are backfilled from the intent columns, then the ledger.
-- 5. merch_payment_settings.pay_at_club_enabled is the CMS switch (on by
--    default, matching the kitchen's existing behaviour).
--
-- Idempotent so a re-run through the hosted Git integration is harmless.
--
-- Rollback (reverse order; safe while no code reads the new columns):
--   drop trigger if exists orders_sync_payment_method_choice on public.orders;
--   drop function if exists public.orders_sync_payment_method_choice();
--   alter table public.orders drop constraint if exists orders_payment_method_choice_check;
--   alter table public.orders drop column if exists payment_method_choice,
--     drop column if exists payment_method_choice_at, drop column if exists payment_method_choice_source,
--     drop column if exists payment_method_choice_by;
--   alter table public.merch_payment_settings drop column if exists pay_at_club_enabled;
--   -- Only once no non-kitchen order has bar_payment_selected_at set:
--   alter table public.orders add constraint orders_bar_payment_kitchen_only
--     check (bar_payment_selected_at is null or order_category = 'kitchen');
begin;
set local lock_timeout = '3s';

alter table public.orders drop constraint if exists orders_bar_payment_kitchen_only;
comment on column public.orders.bar_payment_selected_at is 'Purchaser chose to pay at the club (cash or card at the bar); not proof of receipt and never included in amount_paid.';

alter table public.orders
  add column if not exists payment_method_choice text,
  add column if not exists payment_method_choice_at timestamptz,
  add column if not exists payment_method_choice_source text,
  add column if not exists payment_method_choice_by text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_method_choice_check') then
    alter table public.orders add constraint orders_payment_method_choice_check check (
      (payment_method_choice is null or payment_method_choice in ('stripe', 'bank_transfer', 'pay_at_club'))
      and (payment_method_choice_source is null or payment_method_choice_source in ('purchaser', 'admin', 'backfill'))
    );
  end if;
end $$;

comment on column public.orders.payment_method_choice is 'Stated payment method: stripe, bank_transfer or pay_at_club. Intent only; settled payments are in order_payments.';
comment on column public.orders.payment_method_choice_source is 'Who set the choice: purchaser, admin or backfill.';
comment on column public.orders.payment_method_choice_by is 'Committee user email when an administrator set the choice.';

create index if not exists orders_payment_method_choice_idx on public.orders(payment_method_choice)
  where deleted_at is null;

-- Keeps the choice in step with the intent columns. A statement that sets
-- payment_method_choice itself (card checkout, an administrator) wins.
create or replace function public.orders_sync_payment_method_choice()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  derived text;
begin
  if tg_op = 'INSERT' then
    if new.payment_method_choice is null then
      derived := case
        when new.bar_payment_selected_at is not null then 'pay_at_club'
        when new.bank_transfer_selected_at is not null then 'bank_transfer'
      end;
      if derived is not null then
        new.payment_method_choice := derived;
        new.payment_method_choice_at := coalesce(new.payment_method_choice_at, now());
        new.payment_method_choice_source := coalesce(new.payment_method_choice_source, 'purchaser');
      end if;
    elsif new.payment_method_choice_at is null then
      new.payment_method_choice_at := now();
    end if;
    return new;
  end if;

  if new.payment_method_choice is distinct from old.payment_method_choice then
    -- Set explicitly in this statement.
    if new.payment_method_choice is null then
      new.payment_method_choice_at := null;
      new.payment_method_choice_source := null;
      new.payment_method_choice_by := null;
    elsif new.payment_method_choice_at is not distinct from old.payment_method_choice_at then
      new.payment_method_choice_at := now();
    end if;
    return new;
  end if;

  if new.bar_payment_selected_at is distinct from old.bar_payment_selected_at
     or new.bank_transfer_selected_at is distinct from old.bank_transfer_selected_at then
    derived := case
      when new.bar_payment_selected_at is not null then 'pay_at_club'
      when new.bank_transfer_selected_at is not null then 'bank_transfer'
      -- Clearing an intent column clears a choice it created; a card choice stays.
      when old.payment_method_choice in ('pay_at_club', 'bank_transfer') then null
      else old.payment_method_choice
    end;
    if derived is distinct from old.payment_method_choice then
      new.payment_method_choice := derived;
      new.payment_method_choice_at := case when derived is null then null else now() end;
      new.payment_method_choice_source := case when derived is null then null else 'purchaser' end;
      new.payment_method_choice_by := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.orders_sync_payment_method_choice() from public, anon, authenticated;

drop trigger if exists orders_sync_payment_method_choice on public.orders;
create trigger orders_sync_payment_method_choice
  before insert or update of payment_method_choice, bar_payment_selected_at, bank_transfer_selected_at
  on public.orders
  for each row execute function public.orders_sync_payment_method_choice();

-- Backfill: intent columns first, then the most recent non-void ledger row.
-- Only rows without a choice are touched, so a re-run changes nothing.
update public.orders o
set payment_method_choice = 'pay_at_club',
    payment_method_choice_at = o.bar_payment_selected_at,
    payment_method_choice_source = 'backfill'
where o.payment_method_choice is null and o.bar_payment_selected_at is not null;

update public.orders o
set payment_method_choice = 'bank_transfer',
    payment_method_choice_at = o.bank_transfer_selected_at,
    payment_method_choice_source = 'backfill'
where o.payment_method_choice is null and o.bank_transfer_selected_at is not null;

update public.orders o
set payment_method_choice = case latest.method
      when 'stripe' then 'stripe'
      when 'bank_transfer' then 'bank_transfer'
      when 'cash' then 'pay_at_club'
    end,
    payment_method_choice_at = latest.created_at,
    payment_method_choice_source = 'backfill'
from (
  select distinct on (p.order_id) p.order_id, p.method, p.created_at
  from public.order_payments p
  where p.status <> 'void' and p.method in ('stripe', 'bank_transfer', 'cash')
  order by p.order_id, p.created_at desc
) latest
where latest.order_id = o.id and o.payment_method_choice is null;

alter table public.merch_payment_settings
  add column if not exists pay_at_club_enabled boolean not null default true;
comment on column public.merch_payment_settings.pay_at_club_enabled is 'Offer "pay at the club" on order payment options (kitchen bar payment is unaffected).';

notify pgrst, 'reload schema';
commit;
