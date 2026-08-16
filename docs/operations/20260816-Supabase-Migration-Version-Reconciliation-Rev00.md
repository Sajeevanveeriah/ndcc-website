# Supabase Migration Version Reconciliation

Date: 2026-08-16
Revision: Rev00
Project: NDCC Website
Supabase project: `alduwuipmmnzorcgkcli`

## Outcome

Align repository migration filenames with the versions recorded by Supabase and repair the previously untracked Stripe integrity migration through Supabase's supported migration operation.

No existing migration SQL body was changed.

## Recorded-version renames

| Recorded Supabase version | Previous local filename | Corrected local filename |
| --- | --- | --- |
| `20260806092106` | `20260806190000_event_registration_order_payments.sql` | `20260806092106_event_registration_order_payments.sql` |
| `20260809105226` | `20260809210000_apparel_catalogue_retail_2026_27.sql` | `20260809105226_apparel_catalogue_retail_2026_27.sql` |
| `20260813111527` | `20260813105757_apparel_export_batches.sql` | `20260813111527_apparel_export_batches.sql` |
| `20260815051950` | `20260815050000_simplify_sponsors_and_season_presentation.sql` | `20260815051950_simplify_sponsors_and_season_presentation.sql` |
| `20260815052456` | `20260815053000_current_season_content_cleanup.sql` | `20260815052456_current_season_content_cleanup.sql` |

Supabase production migration metadata was inspected before these renames. Each recorded name and SQL prefix matched its mapped repository file.

## Stripe integrity history alignment

`20260806080000_stripe_checkout_integrity.sql` was already effective in production but had no migration-history row. Its SQL was first preserved under a proposed forward filename while the hosted Git integration was tested. The hosted protected-branch action continued to stop before applying migrations with the generic remote/local history error.

Production prechecks on 2026-08-16 confirmed:

- `order_payments_provider_reference_unique` already existed.
- `protect_order_payment_history()` already existed.
- The payment metadata column existed as JSONB.
- No duplicate non-null `(provider, provider_reference)` pairs existed.

The unchanged, idempotent SQL was then applied through Supabase's supported `apply_migration` operation. Supabase recorded it as:

`20260816025155_stripe_checkout_integrity.sql`

The repository filename, migration manifest and path-dependent test now use that authoritative recorded version. No direct write was made to `supabase_migrations.schema_migrations`.

## Validation

Required before merge:

1. `npm run check:migrations`
2. `npm run test:stripe`
3. `npm run test:migration-replay`
4. `npm run test:payments-ledger`
5. Supabase Preview succeeds
6. Full PR validation, build and security scans succeed
7. SQL blob identity is unchanged across the final rename

Required after merge:

1. Supabase production history contains `20260816025155`
2. The protected `main` branch Supabase action succeeds
3. All `main` checks are green
4. Application build and public route checks remain healthy

## Rollback

Before merge, revert the reconciliation commit.

After merge, code rollback is a Git revert. Do not delete the production migration-history row without a separate evidence-backed investigation. The SQL is intentionally idempotent and the production schema already satisfied it before the supported migration operation recorded it.
