# Production Closeout Rev00

Date: 2026-06-19 UTC.

## Root causes found

1. Admin login retried only thrown network/AbortError failures. Supabase RPC/query builders commonly resolve successfully with `{ data, error, status }`, so returned transient 5xx/PostgREST/network-class errors were not retried.
2. Login classified every RPC/session insert error as generic 503 without stage metadata sufficient to separate request validation, configuration readiness, credential RPC, session insert, and cookie creation.
3. Logout cleared cookies even if the Supabase delete failed, which could convert a temporary backend outage into a destructive client-side logout.
4. Protected client requests did not consistently default to `credentials: include` and `cache: no-store`.

## Exact code fixes

- Added `lib/supabase-operation.ts` with a narrow one-retry helper for Supabase-style `{ data, error, status }` results and retryable thrown AbortError/network exceptions.
- Updated `app/api/admin/auth/login/route.ts` to:
  - validate malformed JSON as 400;
  - check Supabase server configuration before creating the client;
  - retry returned transient Supabase errors once with jitter;
  - preserve 401 for valid credential mismatch;
  - keep 503 for real configuration/RPC/session backend unavailability;
  - log safe stage metadata without credentials, passwords, service keys, session tokens, or token hashes.
- Updated `lib/auth/session.ts` to use the same Supabase returned-error retry helper for session lookups and to include matching 14-day cookie `maxAge` with `expires`.
- Updated `app/api/admin/auth/logout/route.ts` so temporary Supabase delete failures return 503 and do not clear the browser cookie.
- Updated `lib/admin-client.ts`, `app/admin/layout.tsx`, and `app/admin/login/page.tsx` so protected/auth fetches use `credentials: include` and `cache: no-store`.
- Expanded `scripts/test-admin-auth.mjs` static coverage for retry semantics, logout behaviour, and protected fetch defaults.
- Expanded `scripts/test-admin-login.mjs` to cover two simultaneous cookie jars, session persistence, one-session logout preserving the other, dashboard access, and invalid-password 401 without printing cookies or passwords.

## Cloud configuration fixes

No cloud configuration changes were applied from this container because Vercel/Supabase/Resend credentials were not available. No secret values were printed.

## Migrations applied

None. No production schema mutation was performed from this container.

## Supabase project/region

- Requested project ID: `alduwuipmmnzorcgkcli`.
- Requested region: `ap-southeast-1`.
- Verification status from this container: blocked by missing Supabase credentials/env vars.

## Vercel project/region

- Requested project ID: `prj_0MtZQEEplsvISiPecckwyjXc83PB`.
- Requested scope: `sajeevan-veeriahs-projects`.
- `vercel.json` configures functions for `sin1`.
- Verification status from this container: blocked by missing Vercel credentials/project connection.

## Environment variable names checked

The following required names were checked in the process environment only; values were not printed. They were not present in this container: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CONTACT_TO_EMAIL`, `CONTACT_CC_EMAILS`, `CONTACT_BCC_EMAILS`, `NEXT_PUBLIC_SITE_URL`, `AUTH_COOKIE_DOMAIN`, and PlayHQ variables.

## Auth test results

- Static admin auth test passed.
- Live auth test could not run because `AUTH_TEST_BASE_URL`, `AUTH_TEST_EMAIL`, and `AUTH_TEST_PASSWORD` were not configured in the container.
- The updated live auth script is ready to verify login, dashboard access, two concurrent sessions, one-session logout, and invalid password 401 without printing secrets.

## Contact/Resend test results

- Contact structural test ran in non-live mode.
- Email test ran as dry run and reported Resend/contact sender configuration was not present in the container.
- No live Resend message was sent and no contact row was created/deleted from production.

## Sponsor proof

- `npm run test:sponsors` passed for 15 required sponsors and 14 alias canonicalisation cases.
- `npm run check:assets` passed for 15 sponsor logo references.
- `npm run audit:public` passed sponsor/card image checks.

## Appointment/footer/content proof

- `npm run smoke:content` passed source checks for the main content routes.
- Local server content smoke passed against `http://localhost:3000`.
- Public audit passed local image path and content/auth semantics checks.

## Membership/orders/fantasy proof

- Structural fantasy tests passed.
- Local fantasy smoke passed.
- Live membership/order/payment write tests were not run because production/preview credentials were unavailable; no production financial data was mutated.

## Route audit

Local production server route smoke passed for 48 routes including public, fantasy, and admin pages. No `/_not-found` timeout occurred during the local smoke window.

## Build output

- `npm ci`: passed with npm audit warnings.
- `npm run lint`: passed.
- `npm run build`: passed with 67 generated static pages.

## Preview deployment URL

Not available from this container because no Vercel project connection/token was configured.

## Runtime log review

Local runtime was exercised with `next start` and smoke scripts. Vercel production/preview runtime logs were not available from this container.

## Unresolved external blockers

- Vercel connector/env verification is blocked by missing authorised Vercel access in this container.
- Production Supabase schema/auth verification is blocked by missing Supabase service credentials in this container.
- Live preview auth/contact/email tests are blocked by missing preview deployment and test credentials.

## Rollback plan

- Revert the commit `fix: complete NDCC production regression closeout` or redeploy rollback commit `a25a7566f23d9868360377dcc9cc65fe966d686b`.
- No production migrations or data mutations were performed by this closeout, so rollback is code-only for this PR.
