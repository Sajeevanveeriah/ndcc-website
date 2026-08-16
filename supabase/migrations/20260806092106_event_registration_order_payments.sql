-- Link paid event registrations to the canonical orders and payment ledger.
-- Existing registrations remain unchanged and nullable.
--
-- Also keep linked kitchen and event payment-status fields aligned with the
-- canonical order payment status after Stripe or manual ledger updates.
--
-- Rollback:
--   drop trigger if exists orders_sync_linked_payment_status on public.orders;
--   drop function if exists public.sync_linked_order_payment_status();
--   drop index if exists public.event_registrations_order_id_unique;
--   alter table public.event_registrations drop constraint if exists event_registrations_order_id_fkey;
--   alter table public.event_registrations drop column if exists order_id;

alter table public.event_registrations
  add column if not exists order_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_registrations_order_id_fkey'
      and conrelid = 'public.event_registrations'::regclass
  ) then
    alter table public.event_registrations
      add constraint event_registrations_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete set null;
  end if;
end $$;

create unique index if not exists event_registrations_order_id_unique
  on public.event_registrations (order_id)
  where order_id is not null;

create or replace function public.sync_linked_order_payment_status()
returns trigger
set search_path = public
as $$
begin
  if new.payment_status is distinct from old.payment_status then
    if to_regclass('public.kitchen_orders') is not null then
      update public.kitchen_orders
      set payment_status = new.payment_status
      where linked_order_id = new.id;
    end if;

    if to_regclass('public.event_registrations') is not null then
      update public.event_registrations
      set payment_status = new.payment_status
      where order_id = new.id;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_sync_linked_payment_status on public.orders;
create trigger orders_sync_linked_payment_status
  after update of payment_status on public.orders
  for each row execute function public.sync_linked_order_payment_status();

notify pgrst, 'reload schema';
