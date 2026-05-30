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
