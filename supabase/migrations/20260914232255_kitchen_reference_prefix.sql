-- Reconciliation marker for the manual release application recorded at this
-- version. The hosted Git integration also applied the canonical reference
-- migration as 20260915000000_kitchen_reference_prefix.sql. Both operations
-- replaced the same functions/constraint and did not rewrite order references.
-- Fresh databases apply the canonical SQL at that later version; replaying it
-- twice is unnecessary. Keep both recorded versions visible in local history.
select 1;
