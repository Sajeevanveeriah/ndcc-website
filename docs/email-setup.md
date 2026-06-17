# Email setup

The NDCC website sends transactional email through Resend. Contact enquiries are always saved to Supabase first; email delivery status is then reported separately to the public form.

## Vercel Production environment variables

Set these in the Vercel project Production environment:

- `RESEND_API_KEY` — Resend API key used by server-side routes and diagnostics.
- `RESEND_FROM_EMAIL` — verified sender, for example `NDCC Dinos <website@your-verified-domain.example>`.
- `CONTACT_TO_EMAIL` — primary recipient for website contact enquiry notifications.
- `CONTACT_CC_EMAILS` — optional comma-separated CC recipients for contact enquiry notifications.
- `CONTACT_BCC_EMAILS` — optional comma-separated BCC recipients for contact enquiry notifications.

`RESEND_FROM` is still supported as a fallback sender for existing deployments, but `RESEND_FROM_EMAIL` is preferred.

If `CONTACT_TO_EMAIL` is not set, contact notifications fall back to the existing club secretary inbox: `ndcc.secretary1@gmail.com`.

## Deployment notes

- Vercel environment variable changes require a new Production deployment before the running site can use them.
- The Resend sender domain used in `RESEND_FROM_EMAIL` must be verified in Resend before production sends will succeed.
- Public form users do not see raw Resend/provider errors. Admin diagnostics show redacted status only.

## Local dry-run test

```bash
npm run test:email -- recipient@example.com
```

This prints safe configuration status only and does not send email.

## Send a real test

```bash
npm run test:email -- --send recipient@example.com
```

This sends one admin-style contact notification test and one acknowledgement-style test, then prints safe send status and Resend message IDs.
