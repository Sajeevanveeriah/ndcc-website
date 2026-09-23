# Production Regression Baseline Rev00

Date: 2026-06-19 UTC.

## Repository baseline

- Requested starting commit: `a25a7566f23d9868360377dcc9cc65fe966d686b`.
- Local baseline commit verified by `git rev-parse HEAD`: `a25a7566f23d9868360377dcc9cc65fe966d686b`.
- Local checkout initially exposed only branch `work`; no `main` branch or remote was configured, so `git checkout main` / `git pull --ff-only` could not be completed in this container.
- Closeout branch created from the requested commit: `fix/ndcc-production-regression-closeout`.
- Rollback point: `a25a7566f23d9868360377dcc9cc65fe966d686b`.

## Files inspected before editing

- `package.json`
- `AGENTS.md`
- `vercel.json`
- `next.config.mjs`
- `app/api/admin/auth/login/route.ts`
- `app/api/admin/auth/session/route.ts`
- `app/api/admin/auth/logout/route.ts`
- `lib/auth/config.ts`
- `lib/auth/session.ts`
- `lib/auth/guard.ts`
- `lib/auth/password.ts`
- `lib/supabase-server.ts`
- `lib/admin-client.ts`
- `app/admin/layout.tsx`
- `app/admin/login/page.tsx`
- `scripts/admin/provision-users.mjs`
- `scripts/test-admin-login.mjs`
- `scripts/test-admin-auth.mjs`

## Current routes

The Next.js build reported 67 generated static pages and dynamic API/app routes including public routes `/`, `/about`, `/teams`, `/facilities`, `/fixtures`, `/events`, `/news`, `/gallery`, `/join`, `/kitchen`, `/merchandise`, `/sponsors`, `/volunteer`, `/contact`, fantasy routes, admin pages, and admin/API endpoints.

## Current migrations

Migrations present under `supabase/migrations`:

- `20260401_custom_committee_auth.sql`
- `20260401_social_memberships.sql`
- `20260402_content_blocks.sql`
- `20260402_gallery_images.sql`
- `20260402_kitchen_orders.sql`
- `20260402_meeting_minutes.sql`
- `20260402_merch_windows.sql`
- `20260402_payment_reconciliation.sql`
- `20260402_volunteer_eoi.sql`
- `20260406_safe_cms_images_and_merch.sql`
- `20260406_season_appointments.sql`
- `20260408_admin_cms_expansion.sql`
- `20260408_committee_and_history_admin_followup.sql`
- `20260409_event_registration_admin_processing.sql`
- `20260409_remediation_pass.sql`
- `20260425_cms_content_block_expansion.sql`
- `20260510_club_settings.sql`
- `20260510_seed_2026_27_season_appointments.sql`
- `20260510_teams_cms.sql`
- `20260511_fix_season_appointment_uploaded_images.sql`
- `20260517120000_fantasy_foundation.sql`
- `20260517143000_fantasy_playable_mvp.sql`
- `20260530090000_add_premiership_success_news.sql`
- `20260608090000_site_navigation_footer_cms.sql`
- `20260619090000_sponsor_closeout_fields.sql`
- `20260619121500_sponsor_canonical_unique_index.sql`

## Baseline validation results

- `npm ci`: passed; npm reported 11 audit vulnerabilities (3 moderate, 8 high).
- `npm run lint`: passed with no ESLint warnings or errors.
- `npm run build`: passed; Next.js 14.2.35 generated the production build.
- `npm run test:admin-auth`: passed after closeout static auth checks were updated.
- `npm run check:assets`: passed for 15 sponsor logo references.
- `npm run test:admin-login`: not executable in this container because `AUTH_TEST_BASE_URL`, `AUTH_TEST_EMAIL`, and `AUTH_TEST_PASSWORD` were not set.
- `npm run test:admin-delete`: passed; structural tests reported no production data access/deletion.
- `npm run test:contact`: structural mode only; no live API exercised without `SMOKE_BASE_URL`.
- `npm run test:email`: dry run only; Resend/contact env vars were not present.
- `npm run test:sponsors`: passed for 15 required sponsors and 14 alias canonicalisation cases.
- `npm run test:fantasy`: passed structural fantasy tests.
- `npm run smoke:content`: passed source checks for 9 pages.
- `npm run audit:public`: passed public audit.
- `npm run cms:diagnostics`: failed because `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` were not set in the container.
- Local production server smoke with `SMOKE_BASE_URL=http://localhost:3000`: public smoke, content smoke, fantasy smoke, and public audit passed.

## Current known failures and constraints

- The original login retry model only retried thrown exceptions, not returned Supabase `{ data, error, status }` results.
- The container has no cloud credentials/environment values, so Supabase production queries, Vercel env verification, Resend send verification, and live preview auth/contact tests could not be truthfully completed here.
- No production data mutation was performed.

## Cloud access status

- Supabase project ID requested: `alduwuipmmnzorcgkcli` in `ap-southeast-1`.
- Vercel project requested: `prj_0MtZQEEplsvISiPecckwyjXc83PB` under `sajeevan-veeriahs-projects`.
- No Vercel/Supabase/Resend credentials were present in process environment; no secret values were printed.
- `vercel.json` already pins Vercel functions to `sin1`, compatible with Supabase Singapore/AP Southeast placement.

## Rollback path

- Revert this branch or reset deployment to `a25a7566f23d9868360377dcc9cc65fe966d686b`.
- No migrations or production data writes were made during this baseline capture.
