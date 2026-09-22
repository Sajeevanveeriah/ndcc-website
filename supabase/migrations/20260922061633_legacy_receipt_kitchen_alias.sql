-- Preserve the previously supported kitchen reference spelling during reconciliation.
alter table public.legacy_payment_receipt_references drop constraint legacy_payment_receipt_references_canonical_reference_check;
alter table public.legacy_payment_receipt_references add constraint legacy_payment_receipt_references_canonical_reference_check check (canonical_reference ~ '^(NDCC(MER|KIT|MEM|EVT|RAF|DCO|PAY)|NCDDKIT)-[0-9]{4}-[0-9]{6}$');
