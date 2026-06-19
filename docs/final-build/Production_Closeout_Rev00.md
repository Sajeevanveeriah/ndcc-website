# Production Closeout Rev00

## Root cause
Production closeout had not proven admin authentication, contact email delivery, sponsor completeness, fantasy public/admin workflows, or public smoke/audit checks in one repeatable runbook. Contact submissions also depended on Supabase insert success before attempting the admin notification email.

## Exact Vercel env vars
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `CONTACT_TO_EMAIL=ndsc.cricket@gmail.com`
- `CONTACT_CC_EMAILS` optional
- `CONTACT_BCC_EMAILS` optional
- `PLAYHQ_API_KEY` optional for PlayHQ sync diagnostics
- `PLAYHQ_CLIENT_ID` optional for PlayHQ sync diagnostics
- `PLAYHQ_CLIENT_SECRET` optional for PlayHQ sync diagnostics

## Admin provisioning command
Dry-run by default:

```bash
NDCC_SAJ_TEMP_PASSWORD='Admin#1234' \
NDCC_PRESIDENT_TEMP_PASSWORD='Admin#1234' \
NDCC_VP_TEMP_PASSWORD='Admin#1234' \
NEXT_PUBLIC_SUPABASE_URL='<vercel value>' \
SUPABASE_SERVICE_ROLE_KEY='<vercel value>' \
npm run admin:provision-users -- --all
```

Execute only when ready:

```bash
NDCC_SAJ_TEMP_PASSWORD='Admin#1234' \
NDCC_PRESIDENT_TEMP_PASSWORD='Admin#1234' \
NDCC_VP_TEMP_PASSWORD='Admin#1234' \
NEXT_PUBLIC_SUPABASE_URL='<vercel value>' \
SUPABASE_SERVICE_ROLE_KEY='<vercel value>' \
npm run admin:provision-users -- --all --execute
```

## Admin login verification command

```bash
AUTH_TEST_BASE_URL='https://www.ndcc.com.au' \
AUTH_TEST_EMAIL='sajeevanveeriah@gmail.com' \
AUTH_TEST_PASSWORD='<env-only temporary password>' \
npm run test:admin-login
```

## Resend env vars
- `RESEND_API_KEY` must be present.
- `RESEND_FROM_EMAIL` must be a valid verified Resend sender.
- `CONTACT_TO_EMAIL` must be set to `ndsc.cricket@gmail.com` for production contact notifications.

## Sponsor completion summary
The required 15 sponsors are represented in `data/recovery/sponsor-discovery-20260619.json` and fallback sponsor data is preserved when Supabase rows are empty.

## Fantasy completion summary
Fantasy public pages show polished public states, CSV/manual import remains available to admins, and PlayHQ credentials are optional for diagnostics/import fallback.

## Validation output
To be filled from the final production closeout validation run:

```text
npm ci
npm run lint
npm run build
npm run check:assets
npm run test:sponsors
npm run test:fantasy
npm run test:contact
npm run smoke:content
npm run audit:public
npm run test:email
SMOKE_BASE_URL=http://localhost:3000 npm run smoke:content
SMOKE_BASE_URL=http://localhost:3000 npm run audit:public
```

## Rollback path
- Revert this commit to restore prior application code, scripts, and docs.
- Do not delete production data during rollback.
- If sponsor closeout data was upserted, restore previous sponsor rows from Supabase point-in-time backup or manually edit rows in admin CMS.
- If admin temp passwords were provisioned, rotate affected committee user passwords immediately through env-only commands.
