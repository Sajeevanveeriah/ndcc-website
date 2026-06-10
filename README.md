# Newcomb and District Cricket Club (NDCC) Website

Official website for the Newcomb and District Cricket Club — the Dinos. Competing in the Geelong Cricket Association since 1972.

## Tech Stack

- **Framework:** Next.js 14 (App Router) with TypeScript
- **Styling:** Tailwind CSS
- **Database:** Supabase Postgres (managed via `supabase/migrations`)
- **Payments:** Stripe (Payment Links)
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

### Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Apply SQL migrations from `supabase/migrations` in timestamp order.
3. Treat migrations as the source of truth. `supabase/schema.sql` is a legacy snapshot and not authoritative.
4. Copy your project URL, anon key, and service role key to `.env.local`

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Admin Setup (Custom Committee Auth)

1. Apply `20260401_custom_committee_auth.sql` and later migrations.
2. Bootstrap the first admin using `POST /api/admin/auth/bootstrap`.
3. Log in at `/admin/login`.
4. Manage committee users in `/admin/users` (admin-only). Roles available: `admin`, `president`, `secretary`, `committee`.

### Email Setup

The site has two separate email paths. Keep them configured separately:

1. **App transactional email through the Resend API** — contact/enquiry, volunteer, event, membership, order, kitchen, and fantasy manager notification-style emails sent by app API routes through `lib/email.ts`.
2. **Supabase Auth email through Supabase SMTP** — fantasy signup confirmation, resend confirmation, sign-in, and password reset emails controlled by Supabase Auth. These do not go through `lib/email.ts` and should not be implemented as a custom app route.

#### Resend API app email variables

Configure these as **server-only** variables locally and in Vercel:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (for example `NDCC Dinos <noreply@ndcc.com.au>`)

`RESEND_FROM` remains supported as a legacy fallback if `RESEND_FROM_EMAIL` is not set. Do not expose either Resend variable to client components. If `RESEND_API_KEY`, a sender address, or required email fields are missing, or if Resend returns an error, form submissions still complete after the database write. The app logs the email skip/failure and does not block the user-facing flow. Do not claim live email delivery is working until a real Resend send has been tested in the target environment.

#### Supabase Auth SMTP

Configure fantasy signup confirmation and password reset email in **Supabase Dashboard → Authentication → SMTP Settings**. Use Resend SMTP credentials there after Resend domain sending is verified. The typical Resend SMTP values are:

- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: the Resend SMTP/API credential supplied for SMTP use
- Sender name/address: the verified NDCC sender

Do not add a custom app route for Supabase Auth confirmation or password reset emails.

#### Namecheap DNS and Resend sending checklist

DNS changes are manual in Namecheap. For BasicDNS, use **Advanced DNS → Mail Settings → Custom MX** for MX records. Do not automate DNS from this repo.

- Resend domain verification checklist:
  - Confirm Resend DKIM is verified.
  - Add/confirm TXT host `resend._domainkey` for DKIM.
  - Add MX host `send` for Resend return-path feedback SMTP.
  - Add TXT host `send` for SPF.
  - Keep Resend receiving disabled unless inbound email webhooks are intentionally implemented.
  - Do not change the root `@` MX records unless the club intentionally changes mailbox provider.
- Vercel environment variable checklist:
  - Set `RESEND_API_KEY` as a server-only environment variable.
  - Set `RESEND_FROM_EMAIL` to a sender on the verified domain.
  - Keep Supabase service role and Resend secrets out of `NEXT_PUBLIC_*` variables.
  - Redeploy after changing Vercel environment variables.
- Supabase SMTP checklist:
  - Configure Supabase Auth SMTP after Resend sending DNS is verified.
  - Send Supabase Auth test confirmation/reset emails from the Supabase dashboard or a controlled signup/password-reset flow.
- Final live email test checklist:
  - Submit a non-destructive contact/enquiry-style app flow and confirm Resend API delivery.
  - Test a Supabase Auth confirmation email.
  - Test a Supabase Auth password reset email.
  - Confirm failed or missing app email configuration does not block the form/database flow.

Local DNS check commands from Windows PowerShell:

```powershell
Resolve-DnsName -Type TXT resend._domainkey.ndcc.com.au
Resolve-DnsName -Type TXT send.ndcc.com.au
Resolve-DnsName -Type MX send.ndcc.com.au
```

### GitHub-backed CMS Image Upload Setup

Set these as **server-only** environment variables (for local `.env.local` and Vercel Project Environment Variables):

- `GITHUB_CONTENTS_TOKEN`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `GITHUB_CONTENTS_BRANCH`
- `GITHUB_MEDIA_BASE_PATH` (for example `public/images/cms`)
- `GITHUB_COMMITTER_NAME`
- `GITHUB_COMMITTER_EMAIL`
- `VERCEL_DEPLOY_HOOK_URL`

Image uploads from admin forms commit files to GitHub via the Contents API under `public/images` (or a `public/images` subfolder), then return a browser URL that starts with `/images/` and removes the leading `public` segment (for example `/images/cms/YYYY/MM/file.webp`). If `GITHUB_MEDIA_BASE_PATH` is set to `images/cms`, the upload API interprets it as `public/images/cms`; paths outside `public/images` are rejected so uploaded files are web-accessible after deployment.
Set `VERCEL_DEPLOY_HOOK_URL` to a Vercel Production Deploy Hook so uploaded images are published on the live site immediately after upload. The admin form warns editors that a newly uploaded image may not appear publicly until the triggered deployment completes.
Configure these environment variables in **Vercel Production** for the production project.
When environment variables are added or changed in Vercel, trigger a new deployment for them to take effect.

**GitHub token permissions:** `GITHUB_CONTENTS_TOKEN` must be a fine-grained personal access token (or classic token) with **Contents: Read and write** permission on this repository only. If the token expires or loses access, uploads fail with a clear "GitHub authentication failed" error.

**Creating the Vercel Deploy Hook:**

1. In Vercel, open the project → **Settings → Git → Deploy Hooks**.
2. Create a hook named e.g. `cms-media-upload` for the `main` branch.
3. Copy the generated URL into the `VERCEL_DEPLOY_HOOK_URL` environment variable (Production) and redeploy once so the variable takes effect.

**Expected upload sequence:**

1. Admin picks a file in a CMS image field (JPEG/PNG/WebP/GIF, max 4 MB).
2. The API commits the file to GitHub under `public/images/...` on the configured branch and returns the commit link.
3. The API POSTs to the Vercel deploy hook; the admin UI reports whether the deployment was triggered, skipped (no hook configured), or failed.
4. The image becomes publicly visible only after that deployment finishes. The saved `/images/...` URL is correct immediately, but the file is not live until deploy completes.

**Diagnostics:** `/admin/media-diagnostics` shows which media env vars are present (without exposing values), validates the media base path, can test GitHub token/repo/branch access without committing anything, and can fire a test POST to the deploy hook (this triggers a real production deployment).

**Troubleshooting a broken public image:**

1. Open the image URL directly (e.g. `https://<site>/images/cms/YYYY/MM/file.png`). If it loads, the CMS record is fine — hard-refresh the page.
2. Check the file exists in GitHub on the configured branch under `public/images/...`.
3. Check a Vercel deployment was triggered after the upload (Vercel → Deployments).
4. Check that deployment succeeded; if not, redeploy `main` manually.
5. Only if the saved URL itself is wrong (typo, old path), re-save the CMS item with the correct URL.

### CMS Content Workflow

1. Sign in to `/admin`.
2. Edit singleton page text in **Content Blocks**.
3. For repeatable content, use dedicated admin screens (News, Gallery, Sponsors, Apparel, Kitchen, etc.).
4. Use the **Upload image** button in image fields to store assets in GitHub under `/public/images/cms`.
5. Save changes and verify the public page route.

## Project Structure

```
app/
  ├── page.tsx              # Home
  ├── about/                # Club history & committee
  ├── teams/                # Senior Men, Women, Juniors
  ├── facilities/           # Grinter Reserve & training facility
  ├── fixtures/             # Fixtures & results (PlayHQ link)
  ├── events/               # Events listing & registration
  ├── news/                 # News & announcements
  ├── merchandise/          # Club apparel & orders
  ├── sponsors/             # Sponsor tiers & enquiry form
  ├── gallery/              # Photo gallery
  ├── volunteer/            # Volunteer registration
  ├── contact/              # Contact form & details
  ├── admin/                # Protected admin dashboard
  └── api/                  # API routes for form submissions
components/
  ├── ui/                   # Reusable UI components
  ├── layout/               # Navbar & Footer
  ├── forms/                # Form components
  └── admin/                # Admin components
lib/
  ├── supabase.ts           # Supabase client
  ├── supabase-server.ts    # Server-side Supabase client
  ├── stripe.ts             # Stripe configuration
  ├── types.ts              # TypeScript interfaces
  ├── constants.ts          # Club data & constants
  └── utils.ts              # Helper functions
supabase/
  └── schema.sql            # Database schema & RLS policies
```

## Club Details

- **Ground:** Grinter Reserve, 141 Coppards Road, Moolap VIC 3224
- **Association:** Geelong Cricket Association (GCA)
- **Teams:** Senior Men (Grade 4), Senior Women (E Grade East), Junior Boys
- **Training:** Peter 'Skinny' Harrison Training Facility
- **Accreditation:** Good Sports Level 3
- **Partner:** Newcomb Power Football Club

## Licence

All rights reserved. Newcomb and District Cricket Club.

## Final Production Operator Checklist

Use this checklist after deploying this PR. Do not mark live acceptance complete until these dashboard and live-service checks have been completed in the target Vercel/Supabase/Resend projects.

### Vercel environment variables

Configure production values and redeploy after every change:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `RESEND_FROM_EMAIL`
- GitHub media upload variables already used by this repo: `GITHUB_CONTENTS_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_CONTENTS_BRANCH`, `GITHUB_MEDIA_BASE_PATH`, `GITHUB_COMMITTER_NAME`, `GITHUB_COMMITTER_EMAIL`, `VERCEL_DEPLOY_HOOK_URL`
- Stripe variables already used by this repo: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Bank transfer email variables already used by this repo: `NDCC_BANK_ACCOUNT_NAME`, `NDCC_BANK_BSB`, `NDCC_BANK_ACCOUNT_NUMBER`

### Namecheap DNS for Resend sending

- Add/verify `TXT resend._domainkey` exactly as Resend provides it.
- Add/verify the Resend `TXT send` record exactly as Resend provides it.
- Add/verify the Resend `MX send` record exactly as Resend provides it.
- Do not change the root `@` MX records unless the club is deliberately changing mailbox provider.

### Resend

- Domain is verified.
- Sending is enabled.
- Receiving is disabled unless inbound webhook routes are intentionally built later.
- Check Resend logs after using `/admin/email-diagnostics`.

### Supabase Auth email

Supabase Auth confirmation and password reset emails are sent by Supabase SMTP, not by `lib/email.ts`.

- Enable custom SMTP in Supabase Dashboard → Authentication → SMTP Settings.
- Use Resend SMTP values: host `smtp.resend.com`, port `465`, username `resend`, password set to the Resend API/SMTP key, sender set to the verified NDCC sender such as `noreply@ndcc.com.au`.
- Set Supabase Site URL to the production site URL.
- Add redirect URLs for `/fantasy/account` and `/api/auth/callback` on the production domain.
- Confirm email provider and confirmation settings are enabled as intended.

### Fantasy live acceptance test

- Use a fresh email alias that has not previously registered.
- Register at `/fantasy/register` with display name, fantasy team name, email, and password.
- Watch Resend/Supabase Auth logs for the confirmation email.
- Click the confirmation email link and confirm it lands on `/fantasy/account`.
- Confirm the fantasy manager profile is auto-created once and shows as active.
- Log out and log back in to confirm the same profile is preserved.
- If app email is configured, confirm the welcome email result in Resend logs.
