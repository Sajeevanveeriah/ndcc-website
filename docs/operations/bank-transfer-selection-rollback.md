# Rolling back 20260926022450_bank_transfer_selection

This runbook reverses `supabase/migrations/20260926022450_bank_transfer_selection.sql`
(PR #263: purchaser bank deposit selection for orders, raffle, reverse raffle and
Dino Coach, plus admin-confirmed receipts). Treat it as a last resort. It touches
payment evidence, so read the whole page before running anything.

## Prefer the soft rollback

In most cases you do not need to change the database. To stop new bank deposit
selections straight away:

1. In `/admin/orders` (Merchandise tab), untick **Bank transfer enabled** and save.
   If the per-product switches from `20260927020000_bank_transfer_hold_expiry` are
   present, set any product that is explicitly **Enabled** back to **Same as bank
   transfer setting** (or **Disabled**).
2. Existing selections stay visible in `/admin/payments/bank-transfers`. Confirm the
   deposits that arrived and cancel (raffle) or switch back to card (Dino Coach)
   the rest.

Card (Stripe) checkout is not affected by either step.

## When a full rollback is safe

A schema rollback removes the columns that hold audited bank receipts. Only run it
when all of these return `0`:

```sql
select count(*) from public.raffle_orders where payment_method = 'bank_transfer';
select count(*) from public.fantasy_entries where bank_transfer_selected_at is not null or bank_transfer_confirmed_at is not null;
select count(*) from public.orders where bank_transfer_selected_at is not null;
```

If any count is not zero, stop. Those rows are real purchaser choices or confirmed
payments: dropping the columns would lose payment evidence and the restored
`raffle_cash_evidence` constraint would fail. Use the soft rollback instead and
reconcile the rows first.

## Order of operations

1. Deploy the application version from before PR #263 (the code reads the new
   columns and RPC, so it must be rolled back first). Vercel: promote the last
   deployment before #263.
2. Roll back later migrations that depend on this one, newest first, using the
   rollback SQL in each file header:
   - `20260927020100_bank_transfer_confirmed_by_indexes.sql`
   - `20260927020000_bank_transfer_hold_expiry.sql` (restore
     `reverse_raffle_unavailable_numbers()` from `20260922231000` before dropping
     its helper functions)
3. Run the SQL below in one transaction.
4. Do not edit `supabase/remote-migration-history.json` by hand; record the
   rollback with the lead who applies migrations.

## Rollback SQL

```sql
begin;
set local lock_timeout = '3s';

-- 1. Restore the Stripe-only Dino receipt predicate in the four outbox functions.
do $patch$
declare signature text; definition text; patched text;
begin
 foreach signature in array array[
  'public.enqueue_payment_receipt_job(text,uuid,timestamp with time zone)',
  'public.claim_payment_receipt_job(uuid,uuid,integer)',
  'public.preflight_payment_receipt_job(uuid,uuid)',
  'public.requeue_payment_receipt_job(uuid)'
 ] loop
  definition := pg_get_functiondef(signature::regprocedure);
  if signature like '%requeue_%' then
   patched := replace(definition, 'and public.dino_has_payment_evidence(fantasy_entries)', 'and stripe_payment_intent_id ~ ''^pi_''');
  else
   patched := replace(definition, 'public.dino_has_payment_evidence(source)', 'source.stripe_payment_intent_id = source_payment_intent and source_payment_intent ~ ''^pi_''');
  end if;
  if patched = definition then raise exception 'Dino bank receipt predicate not found: %', signature; end if;
  execute patched;
 end loop;
end $patch$;

-- 2. Remove the admin confirmation RPC and the Dino evidence helper.
drop function if exists public.confirm_special_bank_transfer(text,uuid,uuid,integer,text);
drop function if exists public.dino_has_payment_evidence(public.fantasy_entries);

-- 3. Restore raffle payment evidence without bank transfers
--    (definition from 20260924222816_member_trailer_cash_sales).
create or replace function public.raffle_has_payment_evidence(source public.raffle_orders) returns boolean
language sql immutable set search_path='' as $$
 select coalesce((source.payment_method='stripe' and source.stripe_payment_intent_id ~ '^pi_')
 or (source.payment_method='cash' and num_nonnulls(source.cash_received_by,source.cash_received_by_member)=1 and source.cash_received_at is not null and source.cash_sale_key is not null and source.stripe_payment_intent_id is null and source.stripe_checkout_session_id is null),false)
$$;

-- 4. Restore the raffle payment method and cash evidence constraints.
alter table public.raffle_orders drop constraint raffle_cash_evidence;
alter table public.raffle_orders add constraint raffle_cash_evidence check(
 (payment_method='stripe' and cash_received_by is null and cash_received_by_member is null and cash_received_at is null and cash_sale_key is null)
 or (payment_method='cash' and num_nonnulls(cash_received_by,cash_received_by_member)=1 and cash_received_at is not null and cash_sale_key is not null and stripe_payment_intent_id is null and stripe_checkout_session_id is null));
alter table public.raffle_orders drop constraint raffle_orders_payment_method_check;
alter table public.raffle_orders add constraint raffle_orders_payment_method_check check(payment_method in ('stripe','cash'));

-- 5. Drop the selection columns and index.
alter table public.fantasy_entries
  drop column bank_transfer_reference,
  drop column bank_transfer_confirmed_by,
  drop column bank_transfer_confirmed_at,
  drop column bank_transfer_selected_at;
alter table public.raffle_orders
  drop column bank_transfer_reference,
  drop column bank_transfer_confirmed_by,
  drop column bank_transfer_confirmed_at,
  drop column bank_transfer_selected_at;
drop index if exists public.orders_bank_transfer_review_idx;
alter table public.orders drop column bank_transfer_selected_at;

notify pgrst, 'reload schema';
commit;
```

Before running step 3 and step 4, compare them with the live definitions
(`select pg_get_functiondef('public.raffle_has_payment_evidence(public.raffle_orders)'::regprocedure);`
and `select pg_get_constraintdef(oid) from pg_constraint where conname in ('raffle_cash_evidence','raffle_orders_payment_method_check');`).
If a later migration changed them, restore that later definition instead.

## Verify

- `scripts/test-migration-replay.mjs` (with the migration files removed in a
  scratch branch) replays cleanly.
- `/raffle`, `/reverse-raffle`, `/fantasy/account` and `/sponsors/donate` card checkout
  start a Stripe session as before.
- `/admin/payments` and `/admin/orders` load without errors.
