-- Index the bank_transfer_confirmed_by foreign keys added by
-- 20260926022450_bank_transfer_selection (committee user deletes and
-- confirmer lookups no longer scan these tables).
--
-- Rollback:
--   begin;
--   drop index if exists public.raffle_orders_bank_transfer_confirmed_by_idx;
--   drop index if exists public.fantasy_entries_bank_transfer_confirmed_by_idx;
--   commit;
begin;
set local lock_timeout = '3s';
create index if not exists raffle_orders_bank_transfer_confirmed_by_idx
  on public.raffle_orders (bank_transfer_confirmed_by);
create index if not exists fantasy_entries_bank_transfer_confirmed_by_idx
  on public.fantasy_entries (bank_transfer_confirmed_by);
commit;
