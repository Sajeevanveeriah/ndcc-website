# Supabase Migration Version Reconciliation

Date: 2026-08-16
Revision: Rev00
Project: NDCC Website
Supabase project: `alduwuipmmnzorcgkcli`

## Outcome

Align repository migration filenames with the versions already recorded by Supabase, then record the previously untracked Stripe integrity migration through the normal forward migration pipeline.

No existing migration SQL body is changed.

## Recorded-version renames

| Recorded Supabase version | Previous local filename | Corrected local filename |
| --- | --- | --- |
| `20260806092106` | `20260806190000_event_registration_order_payments.sql` | `20260806092106_event_registration_order_payments.sql` |
| `20260809105226` | `20260809210000_apparel_catalogue_retail_2026_27.sql` | `20260809105226_apparel_catalogue_retail_2026_27.sql` |
| `20260813111527` | `20260813105757_apparel_export_batches.sql` | `20260813111527_apparel_export_batches.sql` |
| `20260815051950` | `20260815050000_simplify_sponsors_and_season_presentation.sql` | `20260815051950_simplify_sponsors_and_season_presentation.sql` |
| `20260815052456` | `20260815053000_current_season_content_cleanup.sql` | `20260815052456_current_season_content_cleanup.sql` |

Supabase production migration metadata was inspected before the rename. Each recorded name and SQL prefix matched its mapped repository file.

## Forward history alignment

`20260806080000_stripe_checkout_integrity.sql` was already effective in production but had no migration-history row. It is moved without SQL changes to:

`20260816121900_stripe_checkout_integrity.sql`

This version is later than the current remote history tip. The normal Supabase preview and production pipeline can therefore execute and record it as a forward migration.

Production prechecks on 2026-08-16 confirmed:

- `order_payments_provider_reference_unique` already exists.
- `protect_order_payment_history()` already exists.
- No duplicate non-null `(provider, provider_reference)` pairs exist.

The retained SQL is idempotent for that state. It keeps clean-database replay complete while giving production an ordinary recorded migration version.

## Validation

Required before merge:

1. `npm run check:migrations`
2. `npm run test:migration-replay`
3. `npm run test:payments-ledger`
4. Supabase Preview succeeds
5. Full PR validation and security scans succeed
6. SQL blob identity is unchanged across every rename

Required after merge:

1. Supabase production history contains `20260816121900`
2. `main` checks are green
3. Application build and public route checks remain healthy

## Rollback

Revert the reconciliation commit before merge.

After merge, code rollback is still a Git revert. Do not delete the new production migration-history row unless a separate investigation proves the migration was not applied. The SQL is intentionally idempotent and the existing production schema already satisfies it.
