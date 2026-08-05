-- Stripe Checkout integrity hardening.
--
-- One Stripe Checkout Session may emit more than one lifecycle event. The
-- provider event ID remains unique, while this constraint also ensures the
-- same provider session can produce only one ledger row. Existing duplicate
-- financial history is never deleted or rewritten: the migration fails with
-- an actionable exception so duplicates can be reviewed manually.
--
-- Rollback:
--   alter table public.order_payments
--     drop constraint if exists order_payments_provider_reference_unique;
--   restore protect_order_payment_history() from
--     20260716050000_payment_ledger.sql.

do $$
begin
  if exists (
    select 1
    from public.order_payments
    where provider is not null and provider_reference is not null
    group by provider, provider_reference
    having count(*) > 1
  ) then
    raise exception 'Duplicate provider payment references exist. Review them before applying Stripe checkout integrity.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_payments_provider_reference_unique'
      and conrelid = 'public.order_payments'::regclass
  ) then
    alter table public.order_payments
      add constraint order_payments_provider_reference_unique
      unique (provider, provider_reference);
  end if;
end $$;

-- Settled and refunded rows already protect the amount, order, method,
-- currency, status and provider event ID. Also freeze the provider identity
-- and reversal link so a historical Stripe settlement cannot be reassigned.
create or replace function public.protect_order_payment_history()
returns trigger
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('settled', 'refunded') then
      raise exception 'Settled or refunded payments cannot be deleted; record a reversing payment instead.';
    end if;
    return old;
  end if;

  if old.status in ('settled', 'refunded') then
    if new.amount is distinct from old.amount
       or new.order_id is distinct from old.order_id
       or new.method is distinct from old.method
       or new.currency is distinct from old.currency
       or new.status is distinct from old.status
       or new.provider is distinct from old.provider
       or new.provider_reference is distinct from old.provider_reference
       or new.provider_event_id is distinct from old.provider_event_id
       or new.reverses_payment_id is distinct from old.reverses_payment_id then
      raise exception 'Settled or refunded payments are immutable; record a reversing payment instead.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

notify pgrst, 'reload schema';
